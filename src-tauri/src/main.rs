#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
  )]

  use serde::{Deserialize, Serialize};
  use serde_json::{json, Value};
  use std::fs;
  use std::path::PathBuf;
  use tauri::Manager;
  use tauri::api::dialog::blocking::FileDialogBuilder;
  use std::sync::{Arc, Mutex};
  use notify::{Watcher, RecursiveMode, Config, event::EventKind};

  // ─────────────────── Structuri de date ─────────────────── //

  #[derive(Debug, Serialize, Deserialize)]
  pub struct ChecklistItem {
      pub name: String,
      pub status: String,          // “complete” / “incomplete”

      // ︙ NEW ︙
      #[serde(default)]
      pub proposed: bool,
      #[serde(default)]
      pub verified: bool,
      // ︙ END ︙

      #[serde(default)]
      pub subTasks: Vec<ChecklistItem>,
  }

  #[derive(Debug, Serialize, Deserialize)]
  pub struct Category {
      pub name: String,
      pub checklist: Vec<ChecklistItem>,
  }

  #[derive(Debug, Serialize, Deserialize)]
  pub struct Project {
      pub id: i64,
      pub title: String,
      pub date: String,
      pub categories: Vec<Category>,
  }

  #[derive(Debug, Serialize, Deserialize)]
  pub struct Db {
      pub projects: Vec<Project>,
  }

  // helper care creează un item cu tot cu flag‑urile noi
  fn new_item(name: &str) -> ChecklistItem {
      ChecklistItem {
          name: name.to_string(),
          status: "incomplete".into(),
          proposed: false,
          verified: false,
          subTasks: vec![],
      }
  }

  type SharedWatcher = Arc<Mutex<Option<notify::RecommendedWatcher>>>;

  // ───────────── Helper: calea către fişierul DB ───────────── //

  fn get_db_path() -> PathBuf {
      let exe_dir = std::env::current_exe()
          .ok()
          .and_then(|p| p.parent().map(|pp| pp.to_path_buf()))
          .unwrap_or_else(|| PathBuf::from("."));

      let config_path = exe_dir.join("config.json");

      if config_path.exists() {
          if let Ok(config_str) = fs::read_to_string(&config_path) {
              if let Ok(mut cfg) = serde_json::from_str::<Value>(&config_str) {
                  if let Some(db_path) = cfg.get_mut("db_path") {
                      let path_str = db_path.as_str().unwrap_or("").trim();
                      if path_str.is_empty() {
                          if let Some(chosen) = FileDialogBuilder::new()
                              .set_title("Alege fișierul projects.json")
                              .pick_file()
                          {
                              *db_path = Value::String(chosen.to_string_lossy().into_owned());
                              let _ = fs::write(&config_path, serde_json::to_string_pretty(&cfg).unwrap());
                              return chosen;
                          } else {
                              return PathBuf::from("../src/db/projects.json");
                          }
                      } else {
                          return PathBuf::from(path_str);
                      }
                  }
              }
          }
      }
      PathBuf::from("../src/db/projects.json")
  }

  // ───────────────────── Comenzi Tauri ───────────────────── //

  #[tauri::command]
  fn load_projects() -> Result<Value, String> {
      let path = get_db_path();
      let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
      let json_value: Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
      Ok(json_value)
  }

  fn get_projects_dir() -> PathBuf {
    let exe_dir  = std::env::current_exe()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf();
    let cfg_path = exe_dir.join("config.json");

    if cfg_path.exists() {
        if let Ok(cfg_txt) = std::fs::read_to_string(&cfg_path) {
            if let Ok(mut v) = serde_json::from_str::<Value>(&cfg_txt) {
                if let Some(p_dir) = v.get_mut("projects_dir") {
                    let path_str = p_dir.as_str().unwrap_or("").trim();

                    // ───── 1) dacă DEJA avem o cale validă ─────
                    if !path_str.is_empty() {
                        return PathBuf::from(path_str);
                    }

                    // ───── 2) string gol  →  cerem utilizatorului ─────
                    if let Some(chosen) = FileDialogBuilder::new()
                        .set_title("Alege folderul în care se află proiectele (Publice)")
                        .pick_folder()
                    {
                        *p_dir = Value::String(chosen.to_string_lossy().into_owned());
                        // salvăm imediat noua cale în config
                        let _ = std::fs::write(&cfg_path, serde_json::to_string_pretty(&v).unwrap());
                        return chosen;
                    }
                }
            }
        }
    }

    // ───── 3) fallback hard-coded dacă utilizatorul apasă Cancel ─────
    PathBuf::from("C:\\Users\\Andrei Teodor Dobre\\Desktop\\Facultate\\viarom\\Ofertare - 2025\\Publice")
}


  #[tauri::command]
  fn save_projects(new_data: String) -> Result<(), String> {
      let mut root: Value = serde_json::from_str(&new_data).map_err(|e| e.to_string())?;

      // 2) sortăm projects descrescător după dată (rămânem în Value, nu mai pierdem câmpuri!)
      if let Some(arr) = root
          .get_mut("projects")
          .and_then(|v| v.as_array_mut())
      {
          fn parse_mm_dd_yyyy(s: &str) -> Option<(i32, u32, u32)> {
              let p: Vec<_> = s.split('.').collect();
              if p.len() != 3 { return None; }
              Some((p[2].parse().ok()?, p[0].parse().ok()?, p[1].parse().ok()?))
          }

          arr.sort_by(|a, b| {
              let da = a.get("date").and_then(|v| v.as_str()).and_then(parse_mm_dd_yyyy).unwrap_or((0,0,0));
              let db = b.get("date").and_then(|v| v.as_str()).and_then(parse_mm_dd_yyyy).unwrap_or((0,0,0));
              db.cmp(&da) // descrescător
          });
      }

      // 3) scriem pe disc
      let path = get_db_path();
      fs::write(&path, serde_json::to_string_pretty(&root).unwrap())
          .map_err(|e| e.to_string())
  }

  #[tauri::command]
  fn add_project(title: String, date: String) -> Result<(), String> {
      // citim
      let path = get_db_path();
      let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
      let mut root: Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;

      // calculăm next id
      let next_id = root["projects"]
          .as_array()
          .and_then(|arr| arr.iter().filter_map(|p| p["id"].as_i64()).max())
          .unwrap_or(0) + 1;

      // definim categoriile default cu new_item()
      let new_proj = json!({
          "id": next_id,
          "title": title,
          "date": date,
          "categories": [
              {
                  "name": "Eligibilitate",
                  "checklist": [
                      new_item("Garantia de participare"),
                      new_item("Acorduri de subcontractare"),
                      new_item("Împuterniciri"),
                      new_item("Declarație privind conflictul de interese"),
                      new_item("Centralizator experienta similara"),
                      new_item("Personal")
                  ]
              },
              { "name": "Financiar", "checklist": [ new_item("Propunere financiara") ] },
              { "name": "Tehnic",   "checklist": [] },
              { "name": "PTE/PCCVI","checklist": [ new_item("PTE/PCCVI") ] }
          ]
      });

      root["projects"].as_array_mut().unwrap().push(new_proj);

      // folosim sortarea comună
      save_projects(root.to_string())
  }

  fn get_users_path() -> PathBuf {
    let exe_dir    = std::env::current_exe().unwrap().parent().unwrap().to_path_buf();
    let config_path = exe_dir.join("config.json");
    if config_path.exists() {
      if let Ok(mut cfg) = serde_json::from_str::<Value>(&fs::read_to_string(&config_path).unwrap()) {
        if let Some(up) = cfg.get_mut("users_path") {
          if up.as_str().unwrap().trim().is_empty() {
            if let Some(chosen) = FileDialogBuilder::new()
              .set_title("Alege fișierul users.json")
              .pick_file()
            {
              *up = Value::String(chosen.to_string_lossy().into_owned());
              let _ = fs::write(&config_path, serde_json::to_string_pretty(&cfg).unwrap());
              return chosen;
            }
          } else {
            return PathBuf::from(up.as_str().unwrap());
          }
        }
      }
    }
    // fallback
    exe_dir.join("users.json")
  }

  #[tauri::command]
    fn load_users() -> Result<Value, String> {
    let path = get_users_path();
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
    }

  use regex::Regex;
  use lazy_static::lazy_static;

  fn is_subtask_name(name: &str) -> bool {
      lazy_static! {
          static ref RE_SUB: Regex = Regex::new(
              r"^( {2,}|[><\-\*]|(i|ii|iii|iv|v|vi|vii|viii|ix|x)\b|\d+\.\d+)"
          ).unwrap();
      }
      RE_SUB.is_match(name.trim_start())
  }

  #[tauri::command]
  fn load_technical_data(file_path: String) -> Result<Value, String> {
      use calamine::{open_workbook_auto, Reader};

      let mut workbook = open_workbook_auto(&file_path).map_err(|e| e.to_string())?;
      let sheet = workbook.sheet_names().get(0).ok_or("No sheet")?.clone();
      let range = workbook.worksheet_range(&sheet).ok_or("range")?.map_err(|e| e.to_string())?;

      let mut tech: Vec<Value> = Vec::new();
      let mut last_parent: Option<usize> = None;

      for row in range.rows().skip(5) {
          let cell = row.get(1).and_then(|c| c.get_string()).unwrap_or("").trim();
          if cell.is_empty() { continue; }

          if is_subtask_name(cell) {
              if let Some(p) = last_parent {
                  tech[p]["subTasks"].as_array_mut().unwrap().push(serde_json::to_value(new_item(cell)).unwrap());
              } else {
                  tech.push(serde_json::to_value(new_item(cell)).unwrap());
                  last_parent = Some(tech.len()-1);
              }
          } else {
              tech.push(serde_json::to_value(new_item(cell)).unwrap());
              last_parent = Some(tech.len()-1);
          }
      }
      Ok(Value::Array(tech))
  }

  #[tauri::command]
  fn edit_project(id: i64, new_title: String, new_date: String) -> Result<(), String> {
      let path = get_db_path();
      let mut root: Value = serde_json::from_str(&fs::read_to_string(&path).map_err(|e| e.to_string())?)
          .map_err(|e| e.to_string())?;

      if let Some(prj) = root["projects"]
          .as_array_mut()
          .and_then(|arr| arr.iter_mut().find(|p| p["id"] == id))
      {
          prj["title"] = Value::String(new_title);
          prj["date"]  = Value::String(new_date);
      } else {
          return Err(format!("id={} nu există", id));
      }

      save_projects(root.to_string())
  }

  #[tauri::command]
  fn delete_project(id: i64) -> Result<(), String> {
      let path = get_db_path();
      let mut root: Value = serde_json::from_str(&fs::read_to_string(&path).map_err(|e| e.to_string())?)
          .map_err(|e| e.to_string())?;

      if let Some(arr) = root["projects"].as_array_mut() {
          arr.retain(|p| p["id"] != id);
      }
      save_projects(root.to_string())
  }

  use bcrypt::{verify, hash, DEFAULT_COST};
#[derive(Serialize, Deserialize)] struct Role { editor: bool, verificator: bool }
#[derive(Serialize, Deserialize)] struct User {
    mail: String,
    roles: std::collections::HashMap<String, Role>,
}

#[tauri::command]
fn auth_login(mail: String, password: String) -> Result<User, String> {
    let users_path = get_db_path().with_file_name("users.json");
    let txt = std::fs::read_to_string(users_path).map_err(|e| e.to_string())?;
    let v: Value = serde_json::from_str(&txt).map_err(|e| e.to_string())?;
    let arr = v["users"].as_array().ok_or("users invalid")?;

    for u in arr {
        if u["mail"] == mail {
            let ok = verify(
                &password,
                u["passwordHash"].as_str().unwrap_or(""),
            )
            .unwrap_or(false);

            if ok {
                // trimitem user‑ul fără hash
                let mut clean = u.clone();
                clean.as_object_mut().unwrap().remove("passwordHash");
                return serde_json::from_value(clean).map_err(|e| e.to_string());
            }
        }
    }
    Err("Credențiale invalide".into())
}

#[tauri::command]
fn auth_register(mail: String,
                 password: String,
                 roles: std::collections::HashMap<String, Role>) -> Result<(), String> {

    if !mail.contains('@') {
        return Err("Adresa de e‑mail este invalidă".into());
    }
    if password.len() < 6 {
        return Err("Parola trebuie să aibă cel puțin 6 caractere".into());
    }

    let users_path = get_db_path().with_file_name("users.json");
    let mut root: Value = if users_path.exists() {
        serde_json::from_str(&std::fs::read_to_string(&users_path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?
    } else {
        json!({ "users": [] })
    };

    // verificăm ca mail‑ul să fie unic
    if root["users"]
        .as_array()
        .unwrap()
        .iter()
        .any(|u| u["mail"] == mail)
    {
        return Err("Există deja un cont cu această adresă".into());
    }

    let hash_str = hash(password, DEFAULT_COST).map_err(|e| e.to_string())?;

    let new_user = json!({
        "mail": mail,
        "passwordHash": hash_str,
        "roles": roles
    });

    root["users"].as_array_mut().unwrap().push(new_user);

    std::fs::write(
        &users_path,
        serde_json::to_string_pretty(&root).unwrap(),
    )
    .map_err(|e| e.to_string())
}

fn set_excel_path(project_id: i64, path: Option<&str>) -> Result<(), String> {
    let db_path = get_db_path();
    let txt     = std::fs::read_to_string(&db_path).map_err(|e| e.to_string())?;
    let mut root: Value = serde_json::from_str(&txt).map_err(|e| e.to_string())?;

    if let Some(prj) = root["projects"]
        .as_array_mut()
        .and_then(|arr| arr.iter_mut().find(|p| p["id"] == project_id))
    {
        if let Some(cat) = prj["categories"]
            .as_array_mut()
            .and_then(|arr| arr.iter_mut().find(|c| c["name"] == "Tehnic"))
        {
            match path {
                Some(p) => {
                    cat["excelPath"] = Value::String(p.into());
                },
                None => {
                    cat.as_object_mut()
                       .unwrap()
                       .remove("excelPath");
                },
            }
        }
    }
    std::fs::write(&db_path, serde_json::to_string_pretty(&root).unwrap())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_excel_path(project_id: i64, path: String) -> Result<(), String> {
    set_excel_path(project_id, Some(&path))
}

#[tauri::command]
fn load_config() -> Result<(String, String), String> {
    // aflăm unde e configurarea
    let exe_dir = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .unwrap()
        .to_path_buf();
    let config_path = exe_dir.join("config.json");

    // citim fișierul
    let cfg_text = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let v: serde_json::Value = serde_json::from_str(&cfg_text).map_err(|e| e.to_string())?;

    // extragem cele două căi
    let db_path    = v.get("db_path"   )
                      .and_then(|p| p.as_str())
                      .unwrap_or("")
                      .to_string();
    let users_path = v.get("users_path")
                      .and_then(|p| p.as_str())
                      .unwrap_or("")
                      .to_string();

    Ok((db_path, users_path))
}

lazy_static! {
    static ref RE_FOLDER: Regex = Regex::new(
        r"(?i)^(\d{2}\.\d{2})\s*[- ]\s*(.+)$"   // exemplu "04.28 - Proiect Test"
    ).unwrap();
}

fn parse_folder_name(name: &str) -> Option<(String, String)> {
    let caps = RE_FOLDER.captures(name.trim())?;
    let date  = caps.get(1)?.as_str().to_string();
    let title = caps.get(2)?.as_str().trim().to_string();
    Some((date, title))
}

fn sync_projects_once() -> Result<(), String> {
    use std::collections::HashMap;
    use std::fs;

    let dir = get_projects_dir();          // helperul adăugat în răspunsul anterior
    let dbp = get_db_path();

    // 1) citim DB-ul în memorie
    let txt   = fs::read_to_string(&dbp).map_err(|e| e.to_string())?;
    let mut root: Value = serde_json::from_str(&txt).map_err(|e| e.to_string())?;

    // 2) mapăm (titlu → (id, date))
    let mut by_title: HashMap<String, (i64, String)> = HashMap::new();
    if let Some(arr) = root["projects"].as_array() {
        for p in arr {
            if let (Some(id), Some(title), Some(date)) =
                (p["id"].as_i64(), p["title"].as_str(), p["date"].as_str())
            {
                by_title.insert(title.to_lowercase(), (id, date.to_string()));
            }
        }
    }

    // 3) iterăm prin folderele de pe disc
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if !path.is_dir() { continue; }

        let folder_name = path.file_name().unwrap().to_string_lossy();
        let Some((date_part, title_part)) = parse_folder_name(&folder_name) else { continue };

        match by_title.get(&title_part.to_lowercase()) {
            // 3a) titlul există deja
            Some(&(id, ref old_date)) if *old_date != date_part => {
                // data diferă → actualizează prin edit_project
                edit_project(id, title_part.clone(), format!("{}.2025", date_part))?;
            }
            // 3b) titlul NU există → adaugă proiect nou
            None => {
                add_project(
                    title_part.clone(),
                    format!("{}.2025", date_part)
                )?;
            }
            _ => {} // dacă data e aceeaşi, nu facem nimic
        }
    }
    Ok(())
}

fn spawn_dir_watcher(app_handle: tauri::AppHandle)
    -> notify::Result<notify::RecommendedWatcher>
{
    println!("WATCHER PORNIT PE {:?}", get_projects_dir());

    let (tx, rx) = std::sync::mpsc::channel();

    let mut watcher = notify::recommended_watcher(tx)?;
    watcher.configure(
        Config::default()
            .with_poll_interval(std::time::Duration::from_secs(2))
    )?;
    watcher.watch(&get_projects_dir(), RecursiveMode::Recursive)?;

    // thread separat pentru evenimente
    std::thread::spawn(move || {
        while let Ok(event_res) = rx.recv() {
            let event = match event_res {
                Ok(ev) => ev,
                Err(_) => continue,
            };
            println!("FS EVENT DETECTAT: {:?}", event);

            // interes: primul path și să fie director
            if let Some(path) = event.paths.get(0) {
                if !path.is_dir() {
                    continue;
                }
                // re-sincronizează
                if sync_projects_once().is_ok() {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        let _ = app_handle.emit_all("project_added", name.to_string());
                    }
                }
            }
        }
    });

    Ok(watcher)
}

  // ───────────────────── main() ───────────────────── //

  fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_projects, save_projects, add_project,      // … restul
            load_technical_data, edit_project, delete_project,
            auth_login, auth_register, load_users, load_config,
            save_excel_path
        ])
        .manage::<SharedWatcher>(Arc::new(Mutex::new(None)))
        .setup(|app| {
            // 1) sincronizare iniţială
            if let Err(e) = sync_projects_once() {
                eprintln!("Initial sync error: {e}");
            }

            // 2) porneşte watcher-ul şi salvează-l în State
            match spawn_dir_watcher(app.handle()) {
                Ok(w) => {
                    let shared = app.state::<SharedWatcher>();
                    *shared.lock().unwrap() = Some(w);    // ↙ păstrăm watcher-ul
                }
                Err(e) => eprintln!("Watcher error: {e}"),
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    }
