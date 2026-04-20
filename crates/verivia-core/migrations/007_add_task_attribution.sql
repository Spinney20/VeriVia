-- Track who proposed / verified each checklist item for per-task attribution in reports.
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS proposed_by TEXT;
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS verified_by TEXT;
