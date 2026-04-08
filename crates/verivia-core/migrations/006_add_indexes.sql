-- Indexes on foreign key columns used in WHERE and JOIN clauses.
-- PostgreSQL auto-indexes PRIMARY KEY and UNIQUE, but NOT foreign keys.

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_project_id ON categories(project_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_category_id ON checklist_items(category_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_parent_id ON checklist_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_notes_item_id ON notes(item_id);
CREATE INDEX IF NOT EXISTS idx_projects_year ON projects(year);
