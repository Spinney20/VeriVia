use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Authentication failed: {0}")]
    Auth(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("JWT error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),

    #[error("Bcrypt error: {0}")]
    Bcrypt(#[from] bcrypt::BcryptError),

    #[error("Excel error: {0}")]
    Excel(String),
}

// Convenience alias used throughout the crate
pub type Result<T> = std::result::Result<T, AppError>;

// Allow easy conversion to String for Tauri command error returns
impl From<AppError> for String {
    fn from(e: AppError) -> String {
        e.to_string()
    }
}
