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
  pub status: String, // ex. "incomplete", "complete", "verificat" etc.
  // Subtask-urile; e un vector de ChecklistItem identic (recursiv).
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
  // locația fișierului JSON; îl ai în `src/db/projects.json`
  PathBuf::from("../src/db/projects.json")
}

// ------------------ Comenzi Tauri ------------------ //

/// Încarcă tot JSON-ul ca `serde_json::Value` și îl întoarce în front-end.
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
  let path = get_db_path();
  fs::write(path, new_data).map_err(|e| e.to_string())?;
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

  db.projects.push(new_project);

  let new_db_json = serde_json::to_string_pretty(&db).map_err(|e| e.to_string())?;
  fs::write(path, new_db_json).map_err(|e| e.to_string())?;

  Ok(())
}

// ---------------------------------------------------- //

fn main() {
  tauri::Builder::default()
      .invoke_handler(tauri::generate_handler![
          load_projects,
          save_projects,
          add_project
      ])
      .run(tauri::generate_context!())
      .expect("error while running tauri application");
}
