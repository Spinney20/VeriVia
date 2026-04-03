CREATE TABLE IF NOT EXISTS categories (
    id         SERIAL PRIMARY KEY,
    project_id INT REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    excel_path TEXT,
    UNIQUE(project_id, name)
);
