pub mod auth;
pub mod checklist;
pub mod db;
pub mod errors;
pub mod excel;
pub mod models;
pub mod notes;
pub mod projects;

// Re-export PgPool so consumers don't need a direct sqlx dependency
pub use sqlx::PgPool;
