CREATE TABLE IF NOT EXISTS notes (
    id      SERIAL PRIMARY KEY,
    item_id INT REFERENCES checklist_items(id) ON DELETE CASCADE,
    "user"  TEXT NOT NULL,
    date    TEXT NOT NULL,
    text    TEXT NOT NULL
);
