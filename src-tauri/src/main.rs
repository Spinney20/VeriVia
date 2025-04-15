#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

// ------------------ Structuri de date ------------------ //

#[derive(Debug, Serialize, Deserialize)]
pub struct ChecklistItem {
    pub name: String,
    pub status: String,
    #[serde(default)]
    pub subTasks: Vec<ChecklistItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Category {
    pub name: String,
    // sub-checklist-ul pe care îl poți extinde cu itemi (fiecare item poate avea subTasks)
    pub checklist: Vec<ChecklistItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Project {
    pub id: i64,
    pub title: String,
    pub date: String,
    // pot fi 4 categorii default (Eligibilitate, Financiar, Tehnic, PTE/PCCVI)
    pub categories: Vec<Category>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Db {
    pub projects: Vec<Project>,
}

// ------------------ Helper: citește fișierul DB ------------------ //
fn get_db_path() -> PathBuf {
    // locația fișierului JSON; îl ai în src/db/projects.json
    PathBuf::from("../src/db/projects.json")
}

// ------------------ Comenzi Tauri ------------------ //

/// Încarcă tot JSON-ul ca serde_json::Value și îl întoarce în front-end.
/// Front-end-ul va face structura cum dorește.
#[tauri::command]
fn load_projects() -> Result<Value, String> {
    let path = get_db_path();
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let json_value: Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    Ok(json_value)
}

/// Primește un string cu tot JSON-ul și îl suprascrie în fișier
#[tauri::command]
fn save_projects(new_data: String) -> Result<(), String> {
    // Validăm să fie JSON valid
    let _parsed: Value = serde_json::from_str(&new_data).map_err(|e| e.to_string())?;

    // Parsează totul în structura Db (ca să putem sorta)
    let mut db: Db = serde_json::from_str(&new_data).map_err(|e| e.to_string())?;

    // Funcție pentru a parsa data "MM.DD.YYYY" în tuple (year, month, day)
    // ca să putem sorta corect descrescător
    fn parse_mm_dd_yyyy(s: &str) -> Option<(i32, u32, u32)> {
        let parts: Vec<_> = s.split('.').collect();
        if parts.len() != 3 {
            return None;
        }
        let month = parts[0].parse::<u32>().ok()?;
        let day = parts[1].parse::<u32>().ok()?;
        let year = parts[2].parse::<i32>().ok()?;
        Some((year, month, day))
    }

    // Sortăm descrescător după dată
    db.projects.sort_by(|a, b| {
        let da = parse_mm_dd_yyyy(&a.date).unwrap_or((0,0,0));
        let dbb = parse_mm_dd_yyyy(&b.date).unwrap_or((0,0,0));
        // Pentru descrescător, comparăm b cu a
        dbb.cmp(&da)
    });

    let path = get_db_path();
    // Salvăm din nou ca JSON sortat
    let final_json = serde_json::to_string_pretty(&db).map_err(|e| e.to_string())?;
    fs::write(path, final_json).map_err(|e| e.to_string())?;
    Ok(())
}

/// Adaugă un proiect nou cu categoriile implicite, inclusiv subTasks (goale) la itemi
#[tauri::command]
fn add_project(title: String, date: String) -> Result<(), String> {
    let path = get_db_path();
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut db: Db = serde_json::from_str(&data).map_err(|e| e.to_string())?;

    // Calculăm un nou id (luăm id-ul maxim și îl incrementăm)
    let new_id = match db.projects.iter().map(|p| p.id).max() {
        Some(max_id) => max_id + 1,
        None => 1,
    };

    // Checklist-ul pentru categoria "Eligibilitate"
    let default_eligibility_tasks = vec![
        ChecklistItem {
            name: "Garantia de participare".to_string(),
            status: "incomplete".to_string(),
            subTasks: vec![],
        },
        ChecklistItem {
            name: "Acorduri de subcontractare".to_string(),
            status: "incomplete".to_string(),
            subTasks: vec![],
        },
        ChecklistItem {
            name: "Împuterniciri".to_string(),
            status: "incomplete".to_string(),
            subTasks: vec![],
        },
        ChecklistItem {
            name: "Declarație privind conflictul de interese".to_string(),
            status: "incomplete".to_string(),
            subTasks: vec![],
        },
        ChecklistItem {
            name: "Centralizator experienta similara".to_string(),
            status: "incomplete".to_string(),
            subTasks: vec![],
        },
        ChecklistItem {
            name: "Personal".to_string(),
            status: "incomplete".to_string(),
            subTasks: vec![],
        },
    ];

    // Pentru categoria "Financiar" se adaugă implicit itemul "Propunere financiara"
    let default_financial_tasks = vec![
        ChecklistItem {
            name: "Propunere financiara".to_string(),
            status: "incomplete".to_string(),
            subTasks: vec![],
        },
    ];

    // Pentru categoria "PTE/PCCVI" se adaugă implicit itemul "PTE/PCCVI"
    let default_pte_tasks = vec![
        ChecklistItem {
            name: "PTE/PCCVI".to_string(),
            status: "incomplete".to_string(),
            subTasks: vec![],
        },
    ];

    // Definim categoriile default
    let default_categories = vec![
        Category {
            name: "Eligibilitate".to_string(),
            checklist: default_eligibility_tasks,
        },
        Category {
            name: "Financiar".to_string(),
            checklist: default_financial_tasks,
        },
        Category {
            name: "Tehnic".to_string(),
            checklist: vec![],
        },
        Category {
            name: "PTE/PCCVI".to_string(),
            checklist: default_pte_tasks,
        },
    ];

    let new_project = Project {
        id: new_id,
        title,
        date,
        categories: default_categories,
    };

    // 1) Adăugăm proiectul în DB
    db.projects.push(new_project);

    // 2) Sortează DB descrescător după dată, exact ca în `save_projects`
    fn parse_mm_dd_yyyy(s: &str) -> Option<(i32, u32, u32)> {
        let parts: Vec<_> = s.split('.').collect();
        if parts.len() != 3 {
            return None;
        }
        let month = parts[0].parse::<u32>().ok()?;
        let day = parts[1].parse::<u32>().ok()?;
        let year = parts[2].parse::<i32>().ok()?;
        Some((year, month, day))
    }

    db.projects.sort_by(|a, b| {
        let da = parse_mm_dd_yyyy(&a.date).unwrap_or((0,0,0));
        let dbb = parse_mm_dd_yyyy(&b.date).unwrap_or((0,0,0));
        dbb.cmp(&da)
    });

    // 3) Rescriem fișierul JSON
    let new_db_json = serde_json::to_string_pretty(&db).map_err(|e| e.to_string())?;
    fs::write(path, new_db_json).map_err(|e| e.to_string())?;

    Ok(())
}

// ----------------------------------------------------
// Detectarea “subtask” folosind un regex combinat
// ----------------------------------------------------
use regex::Regex;
use lazy_static::lazy_static;

/// Verifică dacă un `name` reprezintă subtask.
/// Caută la început:
/// - minim 2 spații
/// - sau unul din caracterele `> < - *`
/// - sau un numeral roman (i până la x) urmat de boundary
/// - sau pattern numeric de tip 1.1 (orice \d+\.\d+)
fn is_subtask_name(name: &str) -> bool {
    lazy_static! {
        static ref RE_SUBTASK: Regex = Regex::new(
            r"^( {2,}|[><\-\*]|(i|ii|iii|iv|v|vi|vii|viii|ix|x)\b|\d+\.\d+)"
        ).unwrap();
    }
    // Poți ajusta trim-ul sau nu, în funcție de ce date vin din Excel
    RE_SUBTASK.is_match(name.trim_start())
}

/// Încarcă datele tehnice dintr-un fișier Excel și le mapează la formatul checklist-item-ului.
/// Observă că în loc de "subCategories" se folosește "subTasks" și se setează status-ul ca "incomplete".
#[tauri::command]
fn load_technical_data(file_path: String) -> Result<Value, String> {
    use calamine::{open_workbook_auto, Reader};

    // Deschidem workbook-ul
    let mut workbook = open_workbook_auto(&file_path).map_err(|e| e.to_string())?;
    let sheet_names = workbook.sheet_names().to_owned();
    if sheet_names.is_empty() {
        return Err("Nu s-a găsit niciun sheet în fișier.".into());
    }
    let sheet_name = &sheet_names[0]; // folosim primul sheet
    let range = workbook
        .worksheet_range(sheet_name)
        .ok_or_else(|| "Nu s-a putut accesa sheet-ul.".to_string())?
        .map_err(|e| e.to_string())?;

    // Vectorul final de itemi tehnici
    let mut technical_data: Vec<ChecklistItem> = Vec::new();

    // Ținem minte indexul ultimului “părinte” (fără indent)
    let mut last_parent_index: Option<usize> = None;

    // Sar peste primele rânduri (header + subtitluri etc.). Ajustează după nevoie:
    // .skip(5), .skip(2), etc., în funcție de structura fișierului.
    for row in range.rows().skip(5) {
        // Să zicem că a doua coloană (index 1) este denumirea
        let category_name = row
            .get(1)
            .and_then(|cell| cell.get_string())
            .unwrap_or("")
            .to_string();

        // Dacă e goală, trecem peste
        if category_name.trim().is_empty() {
            continue;
        }

        let subtask = is_subtask_name(&category_name);

        if subtask {
            // Dacă este subtask și avem deja un părinte, îl adăugăm la subTasks
            if let Some(parent_idx) = last_parent_index {
                technical_data[parent_idx].subTasks.push(ChecklistItem {
                    name: category_name.trim().to_owned(),
                    status: "incomplete".to_owned(),
                    subTasks: vec![],
                });
            } else {
                // Dacă n-am avut încă “părinte”, îl considerăm totuși main
                let new_parent = ChecklistItem {
                    name: category_name.trim().to_owned(),
                    status: "incomplete".to_owned(),
                    subTasks: vec![],
                };
                technical_data.push(new_parent);
                last_parent_index = Some(technical_data.len() - 1);
            }
        } else {
            // Nu e indentat => considerăm item "părinte" (main task)
            let new_parent = ChecklistItem {
                name: category_name.trim().to_owned(),
                status: "incomplete".to_owned(),
                subTasks: vec![],
            };
            technical_data.push(new_parent);

            // Ținem minte că acest item devine “ultimul părinte”
            last_parent_index = Some(technical_data.len() - 1);
        }
    }

    // Returnăm totul ca JSON
    Ok(serde_json::to_value(technical_data).map_err(|e| e.to_string())?)
}

// ---------------------------------------------------- //

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_projects,
            save_projects,
            add_project,
            load_technical_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
