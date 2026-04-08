//! One-time migration tool: imports projects.json + users.json into PostgreSQL.
//!
//! Usage:
//!   cargo run -p migrate-json -- --projects path/to/projects.json --users path/to/users.json
//!
//! Requires DATABASE_URL to be set (in environment or .env file).
//! Run AFTER the database tables have been created (migrations should run first via the main app).

use serde::Deserialize;
use sqlx::postgres::PgPoolOptions;
use std::collections::HashMap;
use std::env;
use std::fs;

// ─────────────────────────── JSON shapes (match existing files) ───────────────────────────

#[derive(Deserialize)]
struct ProjectsFile {
    projects: Vec<JsonProject>,
}

#[derive(Deserialize)]
struct JsonProject {
    title: String,
    date: String,
    categories: Vec<JsonCategory>,
    path: Option<String>,
}

#[derive(Deserialize)]
struct JsonCategory {
    name: String,
    checklist: Vec<JsonItem>,
    #[serde(rename = "excelPath")]
    excel_path: Option<String>,
}

#[derive(Deserialize)]
struct JsonItem {
    name: String,
    #[serde(default)]
    proposed: bool,
    #[serde(default)]
    verified: bool,
    #[serde(default)]
    notes: Vec<JsonNote>,
    #[serde(default, rename = "subTasks")]
    sub_tasks: Vec<JsonItem>,
}

#[derive(Deserialize)]
struct JsonNote {
    user: String,
    date: String,
    text: String,
}

#[derive(Deserialize)]
struct UsersFile {
    users: Vec<JsonUser>,
}

#[derive(Deserialize)]
struct JsonUser {
    // Some entries use "username", others use "mail"
    #[serde(alias = "username")]
    mail: Option<String>,
    #[serde(rename = "passwordHash")]
    password_hash: String,
    #[serde(default)]
    roles: HashMap<String, JsonRole>,
}

#[derive(Deserialize)]
struct JsonRole {
    editor: bool,
    verificator: bool,
}

// ─────────────────────────── Main ───────────────────────────

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();

    let mut projects_path: Option<String> = None;
    let mut users_path: Option<String> = None;
    let mut year = "2025".to_string();

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--projects" | "--users" | "--year" => {
                if i + 1 >= args.len() {
                    eprintln!("Error: {} requires a value", args[i]);
                    eprintln!("Usage: migrate-json --projects <path> --users <path> [--year 2025]");
                    std::process::exit(1);
                }
                match args[i].as_str() {
                    "--projects" => projects_path = Some(args[i + 1].clone()),
                    "--users"    => users_path = Some(args[i + 1].clone()),
                    "--year"     => year = args[i + 1].clone(),
                    _ => unreachable!(),
                }
                i += 2;
            }
            _ => {
                eprintln!("Unknown argument: {}", args[i]);
                eprintln!("Usage: migrate-json --projects <path> --users <path> [--year 2025]");
                std::process::exit(1);
            }
        }
    }

    let database_url = env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&database_url)
        .await?;

    println!("Connected to database.");

    // ── Migrate users ──
    if let Some(path) = &users_path {
        let content = fs::read_to_string(path)?;
        let data: UsersFile = serde_json::from_str(&content)?;
        println!("Found {} users to migrate.", data.users.len());

        for user in &data.users {
            let email = user.mail.as_deref().unwrap_or("unknown@viarom.ro");

            // Check if already exists
            let exists: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)"
            )
            .bind(email)
            .fetch_one(&pool)
            .await?;

            if exists {
                println!("  SKIP user {} (already exists)", email);
                continue;
            }

            // Insert user with existing bcrypt hash (no re-hashing)
            let user_id: i32 = sqlx::query_scalar(
                "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id"
            )
            .bind(email)
            .bind(&user.password_hash)
            .fetch_one(&pool)
            .await?;

            // Insert roles
            for (category, role) in &user.roles {
                sqlx::query(
                    "INSERT INTO user_roles (user_id, category, is_editor, is_verificator) VALUES ($1, $2, $3, $4)"
                )
                .bind(user_id)
                .bind(category)
                .bind(role.editor)
                .bind(role.verificator)
                .execute(&pool)
                .await?;
            }

            println!("  OK user {} (id={})", email, user_id);
        }
    }

    // ── Migrate projects ──
    if let Some(path) = &projects_path {
        let content = fs::read_to_string(path)?;
        let data: ProjectsFile = serde_json::from_str(&content)?;
        println!("Found {} projects to migrate.", data.projects.len());

        for proj in &data.projects {
            // Check if already exists (by title + year)
            let exists: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM projects WHERE title = $1 AND year = $2)"
            )
            .bind(&proj.title)
            .bind(&year)
            .fetch_one(&pool)
            .await?;

            if exists {
                println!("  SKIP project '{}' (already exists)", proj.title);
                continue;
            }

            // Insert project
            let project_id: i32 = sqlx::query_scalar(
                "INSERT INTO projects (title, date, year, path) VALUES ($1, $2, $3, $4) RETURNING id"
            )
            .bind(&proj.title)
            .bind(&proj.date)
            .bind(&year)
            .bind(&proj.path)
            .fetch_one(&pool)
            .await?;

            // Insert categories
            for cat in &proj.categories {
                let cat_id: i32 = sqlx::query_scalar(
                    "INSERT INTO categories (project_id, name, excel_path) VALUES ($1, $2, $3) RETURNING id"
                )
                .bind(project_id)
                .bind(&cat.name)
                .bind(&cat.excel_path)
                .fetch_one(&pool)
                .await?;

                // Insert checklist items (parent level)
                for (sort, item) in cat.checklist.iter().enumerate() {
                    let item_id: i32 = sqlx::query_scalar(
                        "INSERT INTO checklist_items (category_id, parent_id, name, proposed, verified, sort_order)
                         VALUES ($1, NULL, $2, $3, $4, $5) RETURNING id"
                    )
                    .bind(cat_id)
                    .bind(&item.name)
                    .bind(item.proposed)
                    .bind(item.verified)
                    .bind(sort as i32)
                    .fetch_one(&pool)
                    .await?;

                    // Parent notes
                    for note in &item.notes {
                        sqlx::query(
                            r#"INSERT INTO notes (item_id, "user", date, text) VALUES ($1, $2, $3, $4)"#
                        )
                        .bind(item_id)
                        .bind(&note.user)
                        .bind(&note.date)
                        .bind(&note.text)
                        .execute(&pool)
                        .await?;
                    }

                    // Subtasks
                    for (sub_sort, sub) in item.sub_tasks.iter().enumerate() {
                        let sub_id: i32 = sqlx::query_scalar(
                            "INSERT INTO checklist_items (category_id, parent_id, name, proposed, verified, sort_order)
                             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id"
                        )
                        .bind(cat_id)
                        .bind(item_id)
                        .bind(&sub.name)
                        .bind(sub.proposed)
                        .bind(sub.verified)
                        .bind(sub_sort as i32)
                        .fetch_one(&pool)
                        .await?;

                        // Subtask notes
                        for note in &sub.notes {
                            sqlx::query(
                                r#"INSERT INTO notes (item_id, "user", date, text) VALUES ($1, $2, $3, $4)"#
                            )
                            .bind(sub_id)
                            .bind(&note.user)
                            .bind(&note.date)
                            .bind(&note.text)
                            .execute(&pool)
                            .await?;
                        }
                    }
                }
            }

            println!("  OK project '{}' (id={})", proj.title, project_id);
        }
    }

    println!("\nMigration complete!");
    Ok(())
}
