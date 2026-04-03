use std::time::Duration;

use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

use crate::errors::Result;

/// Create a connection pool from a DATABASE_URL string.
///
/// Configured for Neon free tier:
/// - 10s acquire timeout (handles cold starts)
/// - test_before_acquire (detects stale connections after Neon idle timeout)
/// - 30min max lifetime (forces reconnect before Neon drops idle connections)
pub async fn create_pool(database_url: &str) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(10))
        .idle_timeout(Duration::from_secs(300))
        .max_lifetime(Duration::from_secs(1800))
        .test_before_acquire(true)
        .connect(database_url)
        .await?;

    Ok(pool)
}

/// Run all pending migrations from the `migrations/` directory.
/// Safe to call on every startup — already-applied migrations are skipped.
pub async fn run_migrations(pool: &PgPool) -> Result<()> {
    sqlx::migrate!("./migrations")
        .run(pool)
        .await
        .map_err(|e| crate::errors::AppError::Database(e.into()))?;

    Ok(())
}
