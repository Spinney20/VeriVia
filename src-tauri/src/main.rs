#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use notify::{Config, RecursiveMode, Watcher};
use regex::Regex;
use lazy_static::lazy_static;
use serde_json::{json, Value};
use verivia_core::PgPool;
use tauri::api::dialog::blocking::FileDialogBuilder;
use tauri::{AppHandle, Manager, State};

use verivia_core::models::{ChecklistItemNested, RoleFlags};

// ═══════════════════════════════════════════════════════════════
//  Tauri-managed state
// ═══════════════════════════════════════════════════════════════

struct AppState {
    current_year: Mutex<String>,
}

type SharedWatcher = Arc<Mutex<Option<notify::RecommendedWatcher>>>;

// ═══════════════════════════════════════════════════════════════
//  Desktop-only helpers (config.json, file dialogs)
// ═══════════════════════════════════════════════════════════════

fn exe_dir() -> PathBuf {
    std::env::current_exe().unwrap().parent().unwrap().to_path_buf()
}

fn cfg_path() -> PathBuf {
    exe_dir().join("config.json")
}

fn load_cfg() -> Value {
    let p = cfg_path();
    if !p.exists() {
        let skeleton = json!({ "current_year": "2026", "years": { "2026": {} } });
        let _ = fs::write(&p, serde_json::to_string_pretty(&skeleton).unwrap());
        return skeleton;
    }
    serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap()
}

fn save_cfg(v: &Value) {
    let _ = fs::write(cfg_path(), serde_json::to_string_pretty(v).unwrap());
}

fn current_year_entry<'a>(cfg: &'a mut Value) -> &'a mut Value {
    let y = cfg["current_year"].as_str().unwrap().to_string();
    cfg["years"].get_mut(&y).unwrap()
}

fn pick_path(title: &str, folder: bool) -> Option<PathBuf> {
    if folder {
        FileDialogBuilder::new().set_title(title).pick_folder()
    } else {
        FileDialogBuilder::new().set_title(title).pick_file()
    }
}

/// Get the projects directory from local config (desktop-only feature for folder sync)
fn get_projects_dir() -> PathBuf {
    let mut cfg = load_cfg();
    let dir_string = {
        let entry = current_year_entry(&mut cfg);
        let val = entry.as_object_mut().unwrap().entry("projects_dir").or_insert(json!(""));
        if val.as_str().unwrap().is_empty() {
            if let Some(chosen) = pick_path("Alege folderul Publice", true) {
                let s = chosen.to_string_lossy().into_owned();
                *val = Value::String(s.clone());
                s
            } else {
                return PathBuf::from(".");
            }
        } else {
            val.as_str().unwrap().to_string()
        }
    };
    save_cfg(&cfg);
    PathBuf::from(dir_string)
}

// ═══════════════════════════════════════════════════════════════
//  Folder-sync & file watcher (desktop-only)
// ═══════════════════════════════════════════════════════════════

lazy_static! {
    static ref RE_FOLDER: Regex = Regex::new(
        r"(?i)^(\d{2}\.\d{2})\s*[- ]\s*(.+)$"
    ).unwrap();
}

fn parse_folder_name(name: &str) -> Option<(String, String)> {
    let caps = RE_FOLDER.captures(name.trim())?;
    Some((
        caps.get(1)?.as_str().to_string(),
        caps.get(2)?.as_str().trim().to_string(),
    ))
}

async fn sync_projects_once(pool: &PgPool, year: &str) -> Result<(), String> {
    use std::collections::HashMap;

    let dir = get_projects_dir();
    let existing = verivia_core::projects::list_projects_light(pool, year)
        .await
        .map_err(|e| e.to_string())?;

    let mut by_title: HashMap<String, (i32, String)> = HashMap::new();
    for p in &existing {
        by_title.insert(p.title.to_lowercase(), (p.id, p.date.clone()));
    }

    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let path = entry.map_err(|e| e.to_string())?.path();
        if !path.is_dir() { continue; }

        let folder_name = path.file_name().unwrap().to_string_lossy();
        let Some((date_part, title_part)) = parse_folder_name(&folder_name) else { continue };

        match by_title.get(&title_part.to_lowercase()) {
            Some(&(id, ref old_date)) if *old_date != date_part => {
                verivia_core::projects::edit_project(pool, id, &title_part, &format!("{}.{}", date_part, year))
                    .await.map_err(|e| e.to_string())?;
            }
            None => {
                let proj = verivia_core::projects::add_project(pool, &title_part, &format!("{}.{}", date_part, year), year)
                    .await.map_err(|e| e.to_string())?;
                verivia_core::projects::save_project_folder(pool, proj.id, &path.to_string_lossy())
                    .await.map_err(|e| e.to_string())?;
            }
            _ => {}
        }
    }
    Ok(())
}

fn spawn_dir_watcher(
    app_handle: AppHandle,
    pool: PgPool,
    year: String,
) -> notify::Result<notify::RecommendedWatcher> {
    let dir = get_projects_dir();
    let (tx, rx) = std::sync::mpsc::channel();

    let mut watcher = notify::recommended_watcher(tx)?;
    watcher.configure(Config::default().with_poll_interval(std::time::Duration::from_secs(2)))?;
    watcher.watch(&dir, RecursiveMode::Recursive)?;

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        while let Ok(event_res) = rx.recv() {
            let event = match event_res { Ok(ev) => ev, Err(_) => continue };
            if let Some(path) = event.paths.first() {
                if !path.is_dir() { continue; }
                if rt.block_on(sync_projects_once(&pool, &year)).is_ok() {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        let _ = app_handle.emit_all("project_added", name.to_string());
                    }
                }
            }
        }
    });

    Ok(watcher)
}

// ═══════════════════════════════════════════════════════════════
//  Tauri commands — thin wrappers around verivia_core
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
async fn auth_login(
    pool: State<'_, PgPool>,
    mail: String,
    password: String,
) -> Result<Value, String> {
    let resp = verivia_core::auth::login(&pool, &mail, &password)
        .await
        .map_err(|e| e.to_string())?;

    // Return shape compatible with existing frontend:
    // { token: "...", user: { mail: "...", roles: {...} } }
    serde_json::to_value(resp).map_err(|e| e.to_string())
}

#[tauri::command]
async fn auth_register(
    pool: State<'_, PgPool>,
    mail: String,
    password: String,
    roles: std::collections::HashMap<String, RoleFlags>,
) -> Result<(), String> {
    verivia_core::auth::register(&pool, &mail, &password, &roles)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_projects(
    pool: State<'_, PgPool>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let year = state.current_year.lock().unwrap().clone();
    let projects = verivia_core::projects::list_projects(&pool, &year)
        .await
        .map_err(|e| e.to_string())?;

    // Wrap in { projects: [...] } to match current frontend expectation
    serde_json::to_value(json!({ "projects": projects })).map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_project(
    pool: State<'_, PgPool>,
    state: State<'_, AppState>,
    title: String,
    date: String,
) -> Result<(), String> {
    let year = state.current_year.lock().unwrap().clone();
    verivia_core::projects::add_project(&pool, &title, &date, &year)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn edit_project(
    pool: State<'_, PgPool>,
    id: i32,
    new_title: String,
    new_date: String,
) -> Result<(), String> {
    verivia_core::projects::edit_project(&pool, id, &new_title, &new_date)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_project(pool: State<'_, PgPool>, id: i32) -> Result<(), String> {
    // Guard: refuse to delete while the project's folder still exists on disk.
    // Otherwise the watcher would recreate an empty project, wiping history.
    if let Some(path) = verivia_core::projects::get_project_path(&pool, id)
        .await
        .map_err(|e| e.to_string())?
    {
        if std::path::Path::new(&path).exists() {
            return Err(format!(
                "Nu poti sterge proiectul cat timp folderul exista pe disc.\nSterge intai folderul: {}",
                path
            ));
        }
    }

    verivia_core::projects::delete_project(&pool, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_checklist(
    pool: State<'_, PgPool>,
    project_id: i32,
    category_name: String,
    items: Vec<ChecklistItemNested>,
) -> Result<(), String> {
    let cat_id = verivia_core::checklist::get_category_id(&pool, project_id, &category_name)
        .await
        .map_err(|e| e.to_string())?;
    verivia_core::checklist::save_category_checklist(&pool, cat_id, &items)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_excel_path(
    pool: State<'_, PgPool>,
    project_id: i32,
    path: String,
) -> Result<(), String> {
    verivia_core::checklist::save_excel_path(&pool, project_id, &path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_project_folder(
    pool: State<'_, PgPool>,
    project_id: i32,
    folder: String,
) -> Result<(), String> {
    verivia_core::projects::save_project_folder(&pool, project_id, &folder)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn load_technical_data(file_path: String) -> Result<Value, String> {
    let items = verivia_core::excel::parse_technical_excel(&file_path)
        .map_err(|e| e.to_string())?;
    serde_json::to_value(items).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_years(pool: State<'_, PgPool>) -> Result<Vec<String>, String> {
    let mut years = verivia_core::projects::list_years(&pool)
        .await
        .map_err(|e| e.to_string())?;

    // If DB has no years yet, return from local config as fallback
    if years.is_empty() {
        let cfg = load_cfg();
        if let Some(obj) = cfg["years"].as_object() {
            years = obj.keys().cloned().collect();
        }
        if years.is_empty() {
            years.push("2026".to_string());
        }
    }
    years.sort();
    Ok(years)
}

#[tauri::command]
fn get_active_year(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.current_year.lock().unwrap().clone())
}

#[tauri::command]
async fn switch_year(
    app: AppHandle,
    pool: State<'_, PgPool>,
    state: State<'_, AppState>,
    year: String,
) -> Result<(), String> {
    // Update local state
    *state.current_year.lock().unwrap() = year.clone();

    // Update local config
    let mut cfg = load_cfg();
    cfg["current_year"] = Value::String(year.clone());
    save_cfg(&cfg);

    app.emit_all("year_switched", &year).ok();

    // Restart watcher
    let shared = app.state::<SharedWatcher>();
    *shared.lock().unwrap() = None;
    let pool_inner: PgPool = pool.inner().clone();
    if let Ok(w) = spawn_dir_watcher(app.clone(), pool_inner, year) {
        *shared.lock().unwrap() = Some(w);
    }
    Ok(())
}

#[tauri::command]
fn add_year() -> Result<String, String> {
    let mut cfg = load_cfg();
    let max_year = cfg["years"]
        .as_object().unwrap()
        .keys()
        .filter_map(|y| y.parse::<u32>().ok())
        .max()
        .unwrap_or(2026);

    let new_year = (max_year + 1).to_string();

    // Data is in PostgreSQL now — only need the local projects folder for sync
    let projects_dir = pick_path("Alege folderul Publice pentru anul nou", true)
        .ok_or("Anulat la alegere Publice")?;

    cfg["years"][&new_year] = json!({
        "projects_dir": projects_dir.to_string_lossy()
    });
    cfg["current_year"] = Value::String(new_year.clone());
    save_cfg(&cfg);

    Ok(new_year)
}

#[tauri::command]
fn load_config() -> Result<(String, String), String> {
    let mut cfg = load_cfg();
    let entry = current_year_entry(&mut cfg);
    Ok((
        entry["db_path"].as_str().unwrap_or("").to_string(),
        entry["users_path"].as_str().unwrap_or("").to_string(),
    ))
}

#[tauri::command]
fn load_users() -> Result<Value, String> {
    // Legacy — reads from local users.json. Will be removed once auth is fully on PostgreSQL.
    let mut cfg = load_cfg();
    let entry = current_year_entry(&mut cfg);
    let path = entry["users_path"].as_str().unwrap_or("").to_string();
    if path.is_empty() {
        return Ok(json!({ "users": [] }));
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_folder(app: AppHandle, path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Calea '{}' nu mai există pe disc.", path));
    }
    tauri::api::shell::open(&app.shell_scope(), &path, None)
        .map_err(|e| e.to_string())
}

// ═══════════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════════

fn main() {
    // Load DATABASE_URL from environment or .env file
    let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
        // Try multiple .env locations:
        // 1) Current working directory (dev mode — project root)
        // 2) Parent of cwd (dev mode — when Tauri runs from src-tauri/)
        // 3) Next to executable (production — installed app)
        let cwd = std::env::current_dir().unwrap_or_default();
        let candidates = [
            cwd.join(".env"),
            cwd.parent().map(|p| p.join(".env")).unwrap_or_default(),
            exe_dir().join(".env"),
        ];

        for env_path in &candidates {
            if env_path.exists() {
                if let Ok(content) = fs::read_to_string(env_path) {
                    for line in content.lines() {
                        let line = line.trim();
                        if line.starts_with('#') || line.is_empty() { continue; }
                        if let Some(val) = line.strip_prefix("DATABASE_URL=") {
                            // Strip surrounding quotes if present
                            let val = val.trim();
                            let val = val.strip_prefix('"').unwrap_or(val);
                            let val = val.strip_suffix('"').unwrap_or(val);
                            let val = val.strip_prefix('\'').unwrap_or(val);
                            let val = val.strip_suffix('\'').unwrap_or(val);
                            return val.to_string();
                        }
                    }
                }
            }
        }
        // Fallback — will cause a connection error at startup
        "postgres://localhost/verivia".to_string()
    });

    // Build async runtime for pool creation
    let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
    let pool = rt.block_on(async {
        let pool = verivia_core::db::create_pool(&database_url)
            .await
            .expect("Failed to connect to database");

        // Run migrations on startup
        verivia_core::db::run_migrations(&pool)
            .await
            .expect("Failed to run migrations");

        pool
    });

    // Determine initial year from config
    let cfg = load_cfg();
    let initial_year = cfg["current_year"]
        .as_str()
        .unwrap_or("2026")
        .to_string();

    tauri::Builder::default()
        .manage(pool.clone())
        .manage::<SharedWatcher>(Arc::new(Mutex::new(None)))
        .manage(AppState {
            current_year: Mutex::new(initial_year.clone()),
        })
        .setup(move |app| {
            // Resolve projects dir ONCE on the main thread (shows picker if empty)
            // — prevents concurrent sync/watcher from both opening dialogs
            let _ = get_projects_dir();

            // Initial folder sync
            let pool_clone = pool.clone();
            let year = initial_year.clone();
            let handle = app.handle();

            // Sync in background thread (non-blocking)
            let pool_for_sync = pool_clone.clone();
            let year_for_sync = year.clone();
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                if let Err(e) = rt.block_on(sync_projects_once(&pool_for_sync, &year_for_sync)) {
                    eprintln!("Initial sync error: {}", e);
                }
            });

            // Start watcher
            if let Ok(w) = spawn_dir_watcher(handle.clone(), pool_clone, year) {
                let shared = app.state::<SharedWatcher>();
                *shared.lock().unwrap() = Some(w);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth_login,
            auth_register,
            load_projects,
            add_project,
            edit_project,
            delete_project,
            save_checklist,
            save_excel_path,
            save_project_folder,
            load_technical_data,
            list_years,
            get_active_year,
            switch_year,
            add_year,
            load_config,
            load_users,
            open_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
