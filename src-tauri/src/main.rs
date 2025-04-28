#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
  )]

  use serde::{Deserialize, Serialize};
  use serde_json::{json, Value};
  use std::fs;
  use std::path::PathBuf;
  use tauri::{Manager, api::shell};
  use tauri::api::dialog::blocking::FileDialogBuilder;
  use std::sync::{Arc, Mutex};
  use notify::{Watcher, RecursiveMode, Config};

  // ─────────── utilitare config & disc ───────────
    fn exe_dir() -> PathBuf {
        std::env::current_exe()
            .unwrap()
            .parent()
            .unwrap()
            .to_path_buf()
    }
    fn cfg_path() -> PathBuf { exe_dir().join("config.json") }

    /// dacă nu există – creează schelet minim
    fn load_cfg() -> Value {
        let p = cfg_path();
        if !p.exists() {
            let skeleton = json!({
                "current_year": "2025",
                "years": { "2025": {} }
            });
            let _ = fs::write(&p, serde_json::to_string_pretty(&skeleton).unwrap());
            return skeleton;
        }
        serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap()
    }
    fn save_cfg(v: &Value) { let _ = fs::write(cfg_path(), serde_json::to_string_pretty(v).unwrap()); }

    /// ne întoarcem la intrarea anului curent (mut)
    fn current_year_entry<'a>(cfg: &'a mut Value) -> &'a mut Value {
        let cur_year = cfg["current_year"].as_str().unwrap().to_string();
        cfg["years"].get_mut(&cur_year).unwrap()
    }

    /// dialog helper
    fn pick_path(title: &str, folder: bool) -> Option<PathBuf> {
        // `set_title()` consumă builder-ul – îl folosim direct în lanț
        if folder {
            FileDialogBuilder::new().set_title(title).pick_folder()
        } else {
            FileDialogBuilder::new().set_title(title).pick_file()
        }
    }

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
    let mut cfg = load_cfg();

    // bloc separat pentru împrumut mutabil
    let db_string = {
        let entry = current_year_entry(&mut cfg);
        let db_val = entry
            .as_object_mut()
            .unwrap()
            .entry("db_path")
            .or_insert(json!(""));

        if db_val.as_str().unwrap().is_empty() {
            if let Some(chosen) = pick_path("Alege projects.json", false) {
                if !chosen.exists() {
                    let _ = fs::write(&chosen, r#"{ "projects": [] }"#);
                }
                let chosen_str = chosen.to_string_lossy().into_owned();
                *db_val = Value::String(chosen_str.clone());
                chosen_str
            } else {
                return PathBuf::from("../src/db/projects.json");
            }
        } else {
            db_val.as_str().unwrap().to_string()
        }
    };

    save_cfg(&cfg);
    PathBuf::from(db_string)
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
    let mut cfg = load_cfg();

    let dir_string = {
        let entry = current_year_entry(&mut cfg);
        let dir_val = entry
            .as_object_mut()
            .unwrap()
            .entry("projects_dir")
            .or_insert(json!(""));

        if dir_val.as_str().unwrap().is_empty() {
            if let Some(chosen) = pick_path("Alege folderul Publice", true) {
                let chosen_str = chosen.to_string_lossy().into_owned();
                *dir_val = Value::String(chosen_str.clone());
                chosen_str
            } else {
                return PathBuf::from(
                    "C:\\Users\\Andrei Teodor Dobre\\Desktop\\Facultate\\viarom\\Ofertare - 2025\\Publice",
                );
            }
        } else {
            dir_val.as_str().unwrap().to_string()
        }
    };

    save_cfg(&cfg);
    PathBuf::from(dir_string)
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
    let mut cfg = load_cfg();

    let users_string = {
        let entry = current_year_entry(&mut cfg);
        let up_val = entry
            .as_object_mut()
            .unwrap()
            .entry("users_path")
            .or_insert(json!(""));

        if up_val.as_str().unwrap().is_empty() {
            if let Some(chosen) = pick_path("Alege users.json", false) {
                let chosen_str = chosen.to_string_lossy().into_owned();
                *up_val = Value::String(chosen_str.clone());
                chosen_str
            } else {
                return exe_dir().join("users.json");
            }
        } else {
            up_val.as_str().unwrap().to_string()
        }
    };

    save_cfg(&cfg);
    PathBuf::from(users_string)
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
            r"^( {2,}|[><\-\*]|(i|ii|iii|iv|v|vi|vii|viii|ix|x)\b|\d+\.\d+|[a-zA-Z][\.\)])"
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

  #[tauri::command]
fn list_years() -> Result<Vec<String>, String> {
    let cfg = load_cfg();
    Ok(cfg["years"]
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect())
}

#[tauri::command]
fn switch_year(app: tauri::AppHandle, year: String) -> Result<(), String> {
    let mut cfg = load_cfg();
    cfg["current_year"] = Value::String(year.clone());
    save_cfg(&cfg);
    app.emit_all("year_switched", &year).ok();
    {
        // repornim watcher-ul pe noul folder
        let shared = app.state::<SharedWatcher>();
        // opreşte vechiul watcher (scapă-l din memorie)
        *shared.lock().unwrap() = None;
        if let Ok(w) = spawn_dir_watcher(app.clone()) {
            *shared.lock().unwrap() = Some(w);
        }
    }
    Ok(())
}

#[tauri::command]
fn add_year() -> Result<String, String> {
    use std::fs;

    // ─── calculăm anul nou ─────────────────────────────────────────
    let mut cfg = load_cfg();
    let max_year = cfg["years"]
        .as_object()
        .unwrap()
        .keys()
        .filter_map(|y| y.parse::<u32>().ok())
        .max()
        .unwrap_or(2025);

    let new_year = (max_year + 1).to_string();

    // ─── ① ALEGEM DOAR FOLDER-UL BAZĂ ─────────────────────────────
    let base_dir = pick_path("Alege folderul pentru anul nou", /*folder*/ true)
        .ok_or("Anulat la alegere folder")?;

    // în folder-ul ales creăm **doar** baza de date
    let db_path = base_dir.join(format!("projects_{}.json", new_year));
    if !db_path.exists() {
        fs::write(&db_path, r#"{ "projects": [] }"#).map_err(|e| e.to_string())?;
    }

    // ─── ② ALEGEM users.json DEJA EXISTENT ────────────────────────
    let users_path = pick_path("Alege users.json existent", /*folder*/ false)
        .ok_or("Anulat la alegere users.json")?;

    if !users_path.exists() {
        return Err("Fişierul users.json nu există.".into());
    }

    // ─── ③ ALEGEM FOLDERUL “Publice” CA ŞI PÂNĂ ACUM ──────────────
    let projects_dir = pick_path("Alege folderul Publice", true)
        .ok_or("Anulat la alegere Publice")?;

    // ─── actualizăm config-ul ─────────────────────────────────────
    cfg["years"][&new_year] = json!({
        "db_path":     db_path.to_string_lossy(),
        "users_path":  users_path.to_string_lossy(),
        "projects_dir":projects_dir.to_string_lossy()
    });
    cfg["current_year"] = Value::String(new_year.clone());
    save_cfg(&cfg);

    Ok(new_year)
}

  use bcrypt::{verify, hash, DEFAULT_COST};
#[derive(Serialize, Deserialize)] struct Role { editor: bool, verificator: bool }
#[derive(Serialize, Deserialize)] struct User {
    mail: String,
    roles: std::collections::HashMap<String, Role>,
}

#[tauri::command]
fn auth_login(mail: String, password: String) -> Result<User, String> {
    let users_path = get_users_path();
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

    let users_path = get_users_path();
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
    let mut cfg = load_cfg();
    let entry   = current_year_entry(&mut cfg);
    Ok((
        entry["db_path"].as_str().unwrap_or("").to_string(),
        entry["users_path"].as_str().unwrap_or("").to_string(),
    ))
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
                                // 1) Create the new project (this writes to disk)
                                add_project(
                                  title_part.clone(),
                                  format!("{}.2025", date_part)
                                )?;

                                // 2) Fetch its new ID (max of all IDs)
                                let db_val = fs::read_to_string(&dbp).map_err(|e| e.to_string())?;
                                let json_val: Value = serde_json::from_str(&db_val).map_err(|e| e.to_string())?;
                                let new_id = json_val["projects"]
                                    .as_array().unwrap()
                                    .iter()
                                    .filter_map(|p| p["id"].as_i64())
                                    .max()
                                    .unwrap();

                                // 3) Save the folder path into the new project record
                                save_project_folder(new_id, path.to_string_lossy().into_owned())?;
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

// ==================== FOLDERE PENTRU PROIECTE ONEDRIVE =========== //
fn set_project_folder(project_id: i64, folder: Option<&str>) -> Result<(), String> {
    let db_path = get_db_path();
    let txt     = fs::read_to_string(&db_path).map_err(|e| e.to_string())?;
    let mut root: Value = serde_json::from_str(&txt).map_err(|e| e.to_string())?;

    if let Some(prj) = root["projects"]
        .as_array_mut()
        .and_then(|arr| arr.iter_mut().find(|p| p["id"] == project_id))
    {
        match folder {
            Some(f) => { prj["path"] = Value::String(f.into()); }
            None    => { prj.as_object_mut().unwrap().remove("path"); }
        }
    }
    fs::write(&db_path, serde_json::to_string_pretty(&root).unwrap())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_project_folder(project_id: i64, folder: String) -> Result<(), String> {
    set_project_folder(project_id, Some(&folder))
}

#[tauri::command]
fn open_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Calea '{}' nu mai există pe disc.", path));
    }
    tauri::api::shell::open(&app.shell_scope(), &path, None)
        .map_err(|e| e.to_string())
}
  // ───────────────────── main() ───────────────────── //

  fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_projects, save_projects, add_project,      // … restul
            load_technical_data, edit_project, delete_project,
            auth_login, auth_register, load_users, load_config,
            save_excel_path,
            list_years, switch_year, add_year, open_folder
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
