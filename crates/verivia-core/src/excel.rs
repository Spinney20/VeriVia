use lazy_static::lazy_static;
use regex::Regex;

use crate::errors::{AppError, Result};
use crate::models::ChecklistItemNested;

lazy_static! {
    static ref RE_SUBTASK: Regex = Regex::new(
        r"^( {2,}|[><\-\*]|(i|ii|iii|iv|v|vi|vii|viii|ix|x)\b|\d+\.\d+|[a-zA-Z][\.\)])"
    ).unwrap();
}

/// Parse an Excel file and extract checklist items for the Tehnic category.
pub fn parse_technical_excel(file_path: &str) -> Result<Vec<ChecklistItemNested>> {
    use calamine::{open_workbook_auto, Reader};

    let mut workbook =
        open_workbook_auto(file_path).map_err(|e| AppError::Excel(e.to_string()))?;

    let sheet = workbook
        .sheet_names()
        .first()
        .ok_or_else(|| AppError::Excel("No sheet found".into()))?
        .clone();

    let range = workbook
        .worksheet_range(&sheet)
        .ok_or_else(|| AppError::Excel("Cannot read range".into()))?
        .map_err(|e| AppError::Excel(e.to_string()))?;

    let mut items: Vec<ChecklistItemNested> = Vec::new();
    let mut last_parent_idx: Option<usize> = None;

    for row in range.rows().skip(5) {
        let cell = row
            .get(1)
            .and_then(|c| c.get_string())
            .unwrap_or("")
            .trim();

        if cell.is_empty() {
            continue;
        }

        if is_subtask_name(cell) {
            let sub = new_nested_item(cell);
            if let Some(p) = last_parent_idx {
                items[p].sub_tasks.push(sub);
            } else {
                items.push(sub);
                last_parent_idx = Some(items.len() - 1);
            }
        } else {
            items.push(new_nested_item(cell));
            last_parent_idx = Some(items.len() - 1);
        }
    }

    Ok(items)
}

fn is_subtask_name(name: &str) -> bool {
    RE_SUBTASK.is_match(name.trim_start())
}

fn new_nested_item(name: &str) -> ChecklistItemNested {
    ChecklistItemNested {
        id: 0,
        name: name.to_string(),
        proposed: false,
        verified: false,
        status: "incomplete".to_string(),
        notes: Vec::new(),
        sub_tasks: Vec::new(),
        proposed_by: None,
        verified_by: None,
    }
}
