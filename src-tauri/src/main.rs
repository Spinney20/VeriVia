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
struct ChecklistItem {
  name: String,
  status: String, // ex. "incomplete", "complete", "verificat" etc.
}

#[derive(Debug, Serialize, Deserialize)]
struct Category {
  name: String,
  // sub-checklist-ul pe care îl poți extinde cu itemi
  // (ex: itemi specifici de verificat în "Eligibilitate")
  checklist: Vec<ChecklistItem>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Project {
  id: i64,
  title: String,
  date: String,
  // pot fi 4 categorii default (Eligibilitate, Financiar, Tehnic, PTE/PCCVI)
  categories: Vec<Category>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Db {
  projects: Vec<Project>,
}

// ------------------ Helper: citește fișierul DB ------------------ //
fn get_db_path() -> PathBuf {
  // locația fișierului JSON; îl ai în `src/db/projects.json`
  PathBuf::from("../src/db/projects.json")
}

// ------------------ Comenzi Tauri ------------------ //

#[tauri::command]
fn load_projects() -> Result<Value, String> {
  let path = get_db_path();
  let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
  // Returnăm conținutul ca serde_json::Value
  let json_value: Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
  Ok(json_value)
}

#[tauri::command]
fn save_projects(new_data: String) -> Result<(), String> {
  // validăm să fie JSON valid
  let _parsed: Value = serde_json::from_str(&new_data).map_err(|e| e.to_string())?;

  let path = get_db_path();
  fs::write(path, new_data).map_err(|e| e.to_string())?;
  Ok(())
}

/// Adaugă un proiect nou cu categoriile implicite
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

  // Definim categoriile default (fără sub-checklist, momentan)
  let default_categories = vec![
      Category {
          name: "Eligibilitate".to_string(),
          checklist: vec![],
      },
      Category {
          name: "Financiar".to_string(),
          checklist: vec![],
      },
      Category {
          name: "Tehnic".to_string(),
          checklist: vec![],
      },
      Category {
          name: "PTE/PCCVI".to_string(),
          checklist: vec![],
      },
  ];

  // Construim noul proiect
  let new_project = Project {
      id: new_id,
      title,
      date,
      categories: default_categories,
  };

  // Îl adăugăm în array
  db.projects.push(new_project);

  // Salvăm totul înapoi în fișier
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
