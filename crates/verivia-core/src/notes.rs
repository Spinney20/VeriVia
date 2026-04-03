use sqlx::PgPool;

use crate::errors::{AppError, Result};
use crate::models::Note;

pub async fn add_note(
    pool: &PgPool,
    item_id: i32,
    user: &str,
    date: &str,
    text: &str,
) -> Result<Note> {
    let note = sqlx::query_as!(
        Note,
        r#"INSERT INTO notes (item_id, "user", date, text)
           VALUES ($1, $2, $3, $4)
           RETURNING id, item_id, "user", date, text"#,
        item_id,
        user,
        date,
        text
    )
    .fetch_one(pool)
    .await?;

    Ok(note)
}

pub async fn edit_note(pool: &PgPool, note_id: i32, new_text: &str) -> Result<()> {
    let rows = sqlx::query!(
        "UPDATE notes SET text = $1 WHERE id = $2",
        new_text,
        note_id
    )
    .execute(pool)
    .await?
    .rows_affected();

    if rows == 0 {
        return Err(AppError::NotFound(format!("Note id={} not found", note_id)));
    }

    Ok(())
}

pub async fn delete_note(pool: &PgPool, note_id: i32) -> Result<()> {
    sqlx::query!("DELETE FROM notes WHERE id = $1", note_id)
        .execute(pool)
        .await?;
    Ok(())
}
