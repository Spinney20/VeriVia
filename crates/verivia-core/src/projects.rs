use std::collections::HashMap;

use sqlx::PgPool;

use crate::errors::{AppError, Result};
use crate::models::{
    Category, CategoryFull, ChecklistItem, ChecklistItemNested, NoteNested, Project, ProjectFull,
};

/// Default categories created for every new project
const DEFAULT_CATEGORIES: &[&str] = &["Eligibilitate", "Financiar", "Tehnic", "PTE/PCCVI"];

const ELIGIBILITATE_DEFAULTS: &[&str] = &[
    "Garantia de participare",
    "Acorduri de subcontractare",
    "Împuterniciri",
    "Declarație privind conflictul de interese",
    "Centralizator experienta similara",
    "Personal",
];

const FINANCIAR_DEFAULTS: &[&str] = &["Propunere financiara"];
const PTE_DEFAULTS: &[&str] = &["PTE/PCCVI"];

// ─────────────────────────── List Projects (batch — 4 queries total) ───────────────────────────

pub async fn list_projects(pool: &PgPool, year: &str) -> Result<Vec<ProjectFull>> {
    // 1) All projects for this year
    let projects = sqlx::query_as!(
        Project,
        "SELECT id, title, date, year, path FROM projects WHERE year = $1 ORDER BY date DESC",
        year
    )
    .fetch_all(pool)
    .await?;

    if projects.is_empty() {
        return Ok(vec![]);
    }

    let project_ids: Vec<i32> = projects.iter().map(|p| p.id).collect();

    // 2) All categories for those projects (1 query)
    let all_categories = sqlx::query_as!(
        Category,
        "SELECT id, project_id, name, excel_path FROM categories WHERE project_id = ANY($1) ORDER BY id",
        &project_ids
    )
    .fetch_all(pool)
    .await?;

    let category_ids: Vec<i32> = all_categories.iter().map(|c| c.id).collect();

    // 3) All checklist items for those categories (1 query)
    let all_items = sqlx::query_as!(
        ChecklistItem,
        "SELECT id, category_id, parent_id, name, proposed, verified, sort_order
         FROM checklist_items WHERE category_id = ANY($1) ORDER BY sort_order, id",
        &category_ids
    )
    .fetch_all(pool)
    .await?;

    let item_ids: Vec<i32> = all_items.iter().map(|i| i.id).collect();

    // 4) All notes for those items (1 query)
    let all_notes = sqlx::query!(
        r#"SELECT item_id, "user", date, text FROM notes WHERE item_id = ANY($1) ORDER BY id"#,
        &item_ids
    )
    .fetch_all(pool)
    .await?;

    // ─── Assemble in memory ───

    // Notes grouped by item_id
    let mut notes_by_item: HashMap<i32, Vec<NoteNested>> = HashMap::new();
    for n in all_notes {
        notes_by_item
            .entry(n.item_id)
            .or_default()
            .push(NoteNested {
                user: n.user,
                date: n.date,
                text: n.text,
            });
    }

    // Children grouped by parent_id
    let mut children_by_parent: HashMap<i32, Vec<&ChecklistItem>> = HashMap::new();
    for item in &all_items {
        if let Some(pid) = item.parent_id {
            children_by_parent.entry(pid).or_default().push(item);
        }
    }

    // Top-level items grouped by category_id
    let mut top_items_by_cat: HashMap<i32, Vec<&ChecklistItem>> = HashMap::new();
    for item in &all_items {
        if item.parent_id.is_none() {
            top_items_by_cat.entry(item.category_id).or_default().push(item);
        }
    }

    // Categories grouped by project_id
    let mut cats_by_project: HashMap<i32, Vec<&Category>> = HashMap::new();
    for cat in &all_categories {
        cats_by_project.entry(cat.project_id).or_default().push(cat);
    }

    // Build nested structure
    let result = projects
        .iter()
        .map(|project| {
            let cats = cats_by_project.get(&project.id).cloned().unwrap_or_default();
            let categories = cats
                .iter()
                .map(|cat| {
                    let items = top_items_by_cat.get(&cat.id).cloned().unwrap_or_default();
                    let checklist = items
                        .iter()
                        .map(|item| {
                            build_nested(item, &children_by_parent, &notes_by_item)
                        })
                        .collect();

                    CategoryFull {
                        name: cat.name.clone(),
                        excel_path: cat.excel_path.clone(),
                        checklist,
                    }
                })
                .collect();

            ProjectFull {
                id: project.id,
                title: project.title.clone(),
                date: project.date.clone(),
                path: project.path.clone(),
                categories,
            }
        })
        .collect();

    Ok(result)
}

/// Recursively build nested checklist items from pre-fetched data (no DB calls)
fn build_nested(
    item: &ChecklistItem,
    children_by_parent: &HashMap<i32, Vec<&ChecklistItem>>,
    notes_by_item: &HashMap<i32, Vec<NoteNested>>,
) -> ChecklistItemNested {
    let sub_tasks = children_by_parent
        .get(&item.id)
        .map(|children| {
            children
                .iter()
                .map(|c| build_nested(c, children_by_parent, notes_by_item))
                .collect()
        })
        .unwrap_or_default();

    let notes = notes_by_item.get(&item.id).cloned().unwrap_or_default();
    let status = if item.proposed && item.verified {
        "complete"
    } else {
        "incomplete"
    };

    ChecklistItemNested {
        id: item.id,
        name: item.name.clone(),
        proposed: item.proposed,
        verified: item.verified,
        status: status.to_string(),
        notes,
        sub_tasks,
    }
}

// ─────────────────────────── Add Project ───────────────────────────

pub async fn add_project(pool: &PgPool, title: &str, date: &str, year: &str) -> Result<Project> {
    let mut tx = pool.begin().await?;

    let project = sqlx::query_as!(
        Project,
        "INSERT INTO projects (title, date, year)
         VALUES ($1, $2, $3)
         RETURNING id, title, date, year, path",
        title, date, year
    )
    .fetch_one(&mut *tx)
    .await?;

    for cat_name in DEFAULT_CATEGORIES {
        let cat_id = sqlx::query_scalar!(
            "INSERT INTO categories (project_id, name) VALUES ($1, $2) RETURNING id",
            project.id, *cat_name
        )
        .fetch_one(&mut *tx)
        .await?;

        let defaults: &[&str] = match *cat_name {
            "Eligibilitate" => ELIGIBILITATE_DEFAULTS,
            "Financiar" => FINANCIAR_DEFAULTS,
            "PTE/PCCVI" => PTE_DEFAULTS,
            _ => &[],
        };

        for (i, name) in defaults.iter().enumerate() {
            sqlx::query!(
                "INSERT INTO checklist_items (category_id, name, sort_order) VALUES ($1, $2, $3)",
                cat_id, *name, i as i32
            )
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;
    Ok(project)
}

// ─────────────────────────── Edit Project ───────────────────────────

pub async fn edit_project(pool: &PgPool, id: i32, new_title: &str, new_date: &str) -> Result<()> {
    let rows = sqlx::query!(
        "UPDATE projects SET title = $1, date = $2 WHERE id = $3",
        new_title, new_date, id
    )
    .execute(pool)
    .await?
    .rows_affected();

    if rows == 0 {
        return Err(AppError::NotFound(format!("Project id={} not found", id)));
    }
    Ok(())
}

// ─────────────────────────── Delete Project ───────────────────────────

pub async fn delete_project(pool: &PgPool, id: i32) -> Result<()> {
    let rows = sqlx::query!("DELETE FROM projects WHERE id = $1", id)
        .execute(pool)
        .await?
        .rows_affected();

    if rows == 0 {
        return Err(AppError::NotFound(format!("Project id={} not found", id)));
    }
    Ok(())
}

// ─────────────────────────── Project Folder ───────────────────────────

pub async fn save_project_folder(pool: &PgPool, id: i32, folder: &str) -> Result<()> {
    sqlx::query!("UPDATE projects SET path = $1 WHERE id = $2", folder, id)
        .execute(pool)
        .await?;
    Ok(())
}

// ─────────────────────────── Lightweight list (for sync) ───────────────────────────

/// Returns only id, title, date — no categories, no items, no notes.
/// Used by folder sync which only needs to match titles.
pub async fn list_projects_light(pool: &PgPool, year: &str) -> Result<Vec<Project>> {
    let projects = sqlx::query_as!(
        Project,
        "SELECT id, title, date, year, path FROM projects WHERE year = $1",
        year
    )
    .fetch_all(pool)
    .await?;
    Ok(projects)
}

// ─────────────────────────── Years ───────────────────────────

pub async fn list_years(pool: &PgPool) -> Result<Vec<String>> {
    // year column is NOT NULL, but sqlx infers Option for expressions.
    // Use "as year!" to force non-null.
    let years = sqlx::query_scalar!(
        r#"SELECT DISTINCT year as "year!" FROM projects ORDER BY year"#
    )
    .fetch_all(pool)
    .await?;
    Ok(years)
}
