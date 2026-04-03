use sqlx::PgPool;

use crate::errors::{AppError, Result};
use crate::models::ChecklistItemNested;

// ─────────────────────────── Toggle Flags ───────────────────────────

pub async fn toggle_flag(pool: &PgPool, item_id: i32, flag: &str, value: bool) -> Result<()> {
    match flag {
        "proposed" => {
            sqlx::query!("UPDATE checklist_items SET proposed = $1 WHERE id = $2", value, item_id)
                .execute(pool).await?;
            sqlx::query!("UPDATE checklist_items SET proposed = $1 WHERE parent_id = $2", value, item_id)
                .execute(pool).await?;
        }
        "verified" => {
            sqlx::query!("UPDATE checklist_items SET verified = $1 WHERE id = $2", value, item_id)
                .execute(pool).await?;
            sqlx::query!("UPDATE checklist_items SET verified = $1 WHERE parent_id = $2", value, item_id)
                .execute(pool).await?;
        }
        _ => return Err(AppError::Validation(format!("Unknown flag: {}", flag))),
    }
    Ok(())
}

// ─────────────────────────── Add / Edit / Delete ───────────────────────────

pub async fn add_item(pool: &PgPool, category_id: i32, parent_id: Option<i32>, name: &str) -> Result<i32> {
    let max_order: i32 = if let Some(pid) = parent_id {
        sqlx::query_scalar!(
            "SELECT COALESCE(MAX(sort_order), -1) as \"v!\" FROM checklist_items WHERE parent_id = $1", pid
        ).fetch_one(pool).await?
    } else {
        sqlx::query_scalar!(
            "SELECT COALESCE(MAX(sort_order), -1) as \"v!\" FROM checklist_items WHERE category_id = $1 AND parent_id IS NULL", category_id
        ).fetch_one(pool).await?
    };

    let id = sqlx::query_scalar!(
        "INSERT INTO checklist_items (category_id, parent_id, name, sort_order) VALUES ($1, $2, $3, $4) RETURNING id",
        category_id, parent_id, name, max_order + 1
    ).fetch_one(pool).await?;

    Ok(id)
}

pub async fn edit_item(pool: &PgPool, item_id: i32, new_name: &str) -> Result<()> {
    let rows = sqlx::query!("UPDATE checklist_items SET name = $1 WHERE id = $2", new_name, item_id)
        .execute(pool).await?.rows_affected();
    if rows == 0 {
        return Err(AppError::NotFound(format!("Checklist item id={} not found", item_id)));
    }
    Ok(())
}

pub async fn delete_item(pool: &PgPool, item_id: i32) -> Result<()> {
    sqlx::query!("DELETE FROM checklist_items WHERE id = $1", item_id)
        .execute(pool).await?;
    Ok(())
}

// ─────────────────────────── Bulk Save (transactional, iterative) ───────────────────────────
// Two-level iteration (parent + subtasks) — matches the UI structure exactly.
//
// KNOWN LIMITATION: Last-writer-wins. If user A and user B both open the same
// category, and B saves while A is still editing, A's save will overwrite B's
// changes (including notes). This is acceptable for the current 2-3 user scale.
// TODO: Move to granular operations (per-item toggle/note API calls) to eliminate this.

pub async fn save_category_checklist(
    pool: &PgPool,
    category_id: i32,
    items: &[ChecklistItemNested],
) -> Result<()> {
    let mut tx = pool.begin().await?;

    // Delete existing (CASCADE removes notes too)
    sqlx::query!("DELETE FROM checklist_items WHERE category_id = $1", category_id)
        .execute(&mut *tx).await?;

    for (i, item) in items.iter().enumerate() {
        // Insert parent item
        let parent_id = sqlx::query_scalar!(
            "INSERT INTO checklist_items (category_id, parent_id, name, proposed, verified, sort_order)
             VALUES ($1, NULL, $2, $3, $4, $5) RETURNING id",
            category_id, item.name, item.proposed, item.verified, i as i32
        ).fetch_one(&mut *tx).await?;

        // Insert parent notes
        for note in &item.notes {
            sqlx::query!(
                r#"INSERT INTO notes (item_id, "user", date, text) VALUES ($1, $2, $3, $4)"#,
                parent_id, note.user, note.date, note.text
            ).execute(&mut *tx).await?;
        }

        // Insert subtasks
        for (j, sub) in item.sub_tasks.iter().enumerate() {
            let sub_id = sqlx::query_scalar!(
                "INSERT INTO checklist_items (category_id, parent_id, name, proposed, verified, sort_order)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
                category_id, parent_id, sub.name, sub.proposed, sub.verified, j as i32
            ).fetch_one(&mut *tx).await?;

            // Insert subtask notes
            for note in &sub.notes {
                sqlx::query!(
                    r#"INSERT INTO notes (item_id, "user", date, text) VALUES ($1, $2, $3, $4)"#,
                    sub_id, note.user, note.date, note.text
                ).execute(&mut *tx).await?;
            }
        }
    }

    tx.commit().await?;
    Ok(())
}

// ─────────────────────────── Save Excel Path ───────────────────────────

pub async fn save_excel_path(pool: &PgPool, project_id: i32, path: &str) -> Result<()> {
    sqlx::query!(
        "UPDATE categories SET excel_path = $1 WHERE project_id = $2 AND LOWER(name) = 'tehnic'",
        path, project_id
    ).execute(pool).await?;
    Ok(())
}

/// Get the category ID for a given project + category name (case-insensitive)
pub async fn get_category_id(pool: &PgPool, project_id: i32, category_name: &str) -> Result<i32> {
    let lower_name = category_name.to_lowercase();
    sqlx::query_scalar!(
        "SELECT id FROM categories WHERE project_id = $1 AND LOWER(name) = $2",
        project_id, lower_name
    )
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!(
        "Category '{}' not found for project {}", category_name, project_id
    )))
}
