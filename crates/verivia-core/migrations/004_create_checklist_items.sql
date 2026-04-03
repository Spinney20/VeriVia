CREATE TABLE IF NOT EXISTS checklist_items (
    id          SERIAL PRIMARY KEY,
    category_id INT REFERENCES categories(id) ON DELETE CASCADE,
    parent_id   INT REFERENCES checklist_items(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    proposed    BOOLEAN DEFAULT false,
    verified    BOOLEAN DEFAULT false,
    sort_order  INT DEFAULT 0
);
