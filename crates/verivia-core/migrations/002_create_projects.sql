CREATE TABLE IF NOT EXISTS projects (
    id         SERIAL PRIMARY KEY,
    title      TEXT NOT NULL,
    date       TEXT NOT NULL,          -- Format: MM.DD.YYYY (zero-padded). Sorts lexicographically.
    year       TEXT NOT NULL DEFAULT '2026',
    path       TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
