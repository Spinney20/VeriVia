use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─────────────────────────── Users ───────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: i32,
    pub email: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct UserRole {
    pub id: i32,
    pub user_id: i32,
    pub category: String,
    pub is_editor: bool,
    pub is_verificator: bool,
}

/// User data returned to the frontend (no password hash, roles as map)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub id: i32,
    #[serde(rename = "mail")]
    pub email: String,
    pub roles: HashMap<String, RoleFlags>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoleFlags {
    pub editor: bool,
    pub verificator: bool,
}

// ─────────────────────────── Auth ───────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: UserProfile,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JwtClaims {
    pub sub: i32,
    pub email: String,
    pub exp: usize,
}

// ─────────────────────────── Projects ───────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Project {
    pub id: i32,
    pub title: String,
    pub date: String,
    pub year: String,
    pub path: Option<String>,
}

// ─────────────────────────── Categories ───────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Category {
    pub id: i32,
    pub project_id: i32,
    pub name: String,
    pub excel_path: Option<String>,
}

// ─────────────────────────── Checklist Items ───────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ChecklistItem {
    pub id: i32,
    pub category_id: i32,
    pub parent_id: Option<i32>,
    pub name: String,
    pub proposed: bool,
    pub verified: bool,
    pub sort_order: i32,
    pub proposed_by: Option<String>,
    pub verified_by: Option<String>,
}

// ─────────────────────────── Notes ───────────────────────────
// Matches exactly what the frontend sends/expects: { user, date, text }

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Note {
    pub id: i32,
    pub item_id: i32,
    pub user: String,
    pub date: String,
    pub text: String,
}

// ─────────────────────────── Frontend-compatible nested shapes ───────────────────────────
// These match the JSON structure the React frontend currently works with.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectFull {
    pub id: i32,
    pub title: String,
    pub date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    pub categories: Vec<CategoryFull>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryFull {
    pub name: String,
    #[serde(rename = "excelPath", skip_serializing_if = "Option::is_none")]
    pub excel_path: Option<String>,
    pub checklist: Vec<ChecklistItemNested>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChecklistItemNested {
    #[serde(default)]
    pub id: i32,
    pub name: String,
    #[serde(default)]
    pub proposed: bool,
    #[serde(default)]
    pub verified: bool,
    #[serde(default = "default_incomplete")]
    pub status: String,
    #[serde(default)]
    pub notes: Vec<NoteNested>,
    #[serde(default, rename = "subTasks")]
    pub sub_tasks: Vec<ChecklistItemNested>,
    #[serde(default, rename = "proposedBy", skip_serializing_if = "Option::is_none")]
    pub proposed_by: Option<String>,
    #[serde(default, rename = "verifiedBy", skip_serializing_if = "Option::is_none")]
    pub verified_by: Option<String>,
}

/// Note as the frontend sees it — just user, date, text
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteNested {
    pub user: String,
    pub date: String,
    pub text: String,
}

fn default_incomplete() -> String {
    "incomplete".to_string()
}
