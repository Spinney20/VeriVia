# VeriVia Architecture Document

> **Last updated:** 2026-04-02
> **Author:** Andrei Teodor Dobre + Claude (AI pair)
> **Status:** Planning / Pre-migration

---

## 1. What is VeriVia?

VeriVia is an internal verification tool for managing public procurement projects.
It tracks document checklists across four verification categories (Eligibilitate,
Financiar, Tehnic, PTE/PCCVI) with a dual-role workflow: **editors** propose
completion and **verificators** confirm it. The app generates PDF verification
reports when all items pass review.

### 1.1 Core Domain Concepts

| Concept | Description |
|---------|-------------|
| **Project** | A public procurement bid, identified by title + date |
| **Category** | One of 4 verification domains: Eligibilitate, Financiar, Tehnic, PTE/PCCVI |
| **ChecklistItem** | A verification task within a category. Has `proposed` (editor) and `verified` (verificator) flags. Status = complete only when both are true |
| **SubTask** | A child checklist item nested under a parent. Same flags as parent |
| **Note** | A timestamped comment attached to any checklist item by a user |
| **User** | Authenticated via email + password (bcrypt). Has per-category role assignments |
| **Role** | Per-category: `{ editor: bool, verificator: bool }`. A user can hold both roles on the same category |
| **Year** | Projects are organized by year. Each year has its own DB path, users file, and projects directory |

### 1.2 Key Workflows

1. **Login** - User authenticates with email + password
2. **Browse projects** - Filterable list, organized by year, sorted by date descending
3. **Open category** - If user has both roles, they choose which role to enter with
4. **Edit checklist** - Editor adds/removes/renames tasks, toggles `proposed` flag
5. **Verify checklist** - Verificator toggles `verified` flag (only if `proposed` is true)
6. **Add notes** - Both roles can attach notes to any item
7. **Generate PDF** - When all items are complete, export a branded verification report
8. **Excel import** - Tehnic category can import task lists from Excel files
9. **Folder sync** - File watcher monitors a directory and auto-creates projects from folder names

---

## 2. Current Architecture (v1 - as-is)

```
┌──────────────────────────────────────┐
│            Tauri v1 Shell            │
│  ┌────────────────────────────────┐  │
│  │   React 18 + Vite + MUI 7     │  │
│  │   invoke("command", args)      │  │
│  └──────────────┬─────────────────┘  │
│  ┌──────────────┴─────────────────┐  │
│  │   Rust Backend (main.rs)       │  │
│  │   797 lines, single file       │  │
│  │   • serde_json (CRUD)          │  │
│  │   • bcrypt (auth)              │  │
│  │   • calamine (Excel parsing)   │  │
│  │   • notify (file watcher)      │  │
│  └──────────────┬─────────────────┘  │
│                 │                     │
│  ┌──────────────┴─────────────────┐  │
│  │   JSON files on disk           │  │
│  │   • projects.json (~all data)  │  │
│  │   • users.json (credentials)   │  │
│  │   • config.json (paths/years)  │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### 2.1 Current Problems

| # | Problem | Impact |
|---|---------|--------|
| P1 | **JSON as database** - Entire file read/written on every operation | No concurrency, no queries, no indexing, data loss risk |
| P2 | **Single main.rs (797 LOC)** - Auth, CRUD, Excel, file watcher, config all in one file | Untestable, hard to maintain, impossible to reuse for web |
| P3 | **Auth via localStorage** - User object (with roles) stored as plain JSON in browser storage | No token expiry, no server-side session, trivially spoofable |
| P4 | **Hardcoded fallback paths** - `C:\Users\Andrei Teodor Dobre\Desktop\...` in source | Breaks on any other machine |
| P5 | **Frontend monolith** - ProjectsView.jsx is 853 lines with 20+ state variables | Hard to maintain, everything coupled |
| P6 | **No error handling** - `.unwrap()` throughout Rust, `alert()` in frontend | Crashes on unexpected input |
| P7 | **Tight Tauri coupling** - Every data call uses `invoke()` directly from `@tauri-apps/api` | Cannot run as web app without rewriting every component |
| P8 | **shell allowlist was "all: true"** | Fixed (2026-04-02): restricted to `open` only |

### 2.2 Current File Map

```
src/
├── App.jsx                          # Router setup, loads config
├── main.jsx                         # React entry point
├── index.css                        # Global styles, background image
├── auth/
│   ├── AuthContext.jsx               # React context: login/logout/user state
│   └── RequireAuth.jsx               # Protected route wrapper
├── pages/
│   ├── LoginView.jsx                 # Login + register forms (242 LOC)
│   └── ProjectsView.jsx             # Main view: project list + all modals (853 LOC)
├── components/
│   ├── ComplexChecklistModal.jsx     # Core checklist UI: flags, notes, PDF export (1173 LOC)
│   ├── EligibilityModal.jsx          # Thin wrapper → ComplexChecklistModal
│   ├── FinanciarModal.jsx            # Thin wrapper → ComplexChecklistModal
│   ├── PteModal.jsx                  # Wrapper + warning banner
│   └── TehnicModal.jsx              # Wrapper + Excel import logic (199 LOC)
├── db/
│   ├── projects.json                 # Project data (to be replaced by PostgreSQL)
│   ├── users.json                    # User credentials (to be replaced by PostgreSQL)
│   └── schema.sql                    # Empty (unused)
├── fonts/                            # Roboto .ttf files for PDF generation
└── images/                           # App icon, background, logos

src-tauri/
├── Cargo.toml                        # Rust dependencies
├── tauri.conf.json                   # Tauri config (shell restricted)
└── src/
    └── main.rs                       # ALL backend logic (797 LOC)
```

---

## 3. Target Architecture (v2)

### 3.1 Design Goals

| Goal | Description |
|------|-------------|
| **G1: Dual-target** | Same codebase must produce a desktop app (Tauri) AND a web app (Axum) with minimal divergence |
| **G2: Hosted DB only** | Only the PostgreSQL database is hosted remotely. No app server costs for desktop mode |
| **G3: Azure-ready** | Migration to Azure = changing a connection string. No vendor lock-in |
| **G4: Shared core** | Business logic written once in Rust, consumed by both Tauri commands and HTTP handlers |
| **G5: Clean separation** | Frontend knows nothing about transport (invoke vs fetch). Backend knows nothing about presentation |

### 3.2 High-Level Diagram

```
┌─ FRONTEND (React - shared) ──────────────────────────────────┐
│                                                               │
│   React 18 + Vite + MUI 7 + Tailwind                        │
│                                                               │
│   All data calls go through:                                  │
│     src/api/client.js                                         │
│       → IS_TAURI ? invoke("cmd", args)                        │
│       → else     ? fetch("/api/...", args)                    │
│                                                               │
└────────────────────┬──────────────────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          │                     │
   ┌──────┴───────┐    ┌───────┴──────┐
   │  DESKTOP      │    │  WEB          │
   │  (Tauri v1)   │    │  (Axum)       │
   │               │    │               │
   │  #[tauri::    │    │  #[axum::     │
   │   command]    │    │   handler]    │
   │  thin wrapper │    │  thin wrapper │
   └──────┬────────┘    └───────┬──────┘
          │                     │
          └──────────┬──────────┘
                     │
          ┌──────────┴──────────┐
          │  verivia-core       │
          │  (Rust library)     │
          │                     │
          │  • projects.rs      │
          │  • auth.rs          │
          │  • checklist.rs     │
          │  • excel.rs         │
          │  • models.rs        │
          │  • db.rs            │
          └──────────┬──────────┘
                     │
                     │  sqlx (async PostgreSQL)
                     │
          ┌──────────┴──────────┐
          │  PostgreSQL          │
          │                     │
          │  NOW:  Neon (free)  │
          │  LATER: Azure DB    │
          │                     │
          │  Migration =        │
          │  change conn string │
          └─────────────────────┘
```

### 3.3 Project Structure

```
verivia/
├── Cargo.toml                        # Workspace root
│
├── crates/
│   └── verivia-core/                 # Shared business logic (THE core)
│       ├── Cargo.toml                # sqlx, bcrypt, calamine, jsonwebtoken
│       ├── migrations/               # SQL migration files (sqlx-managed)
│       │   ├── 001_create_users.sql
│       │   ├── 002_create_projects.sql
│       │   ├── 003_create_categories.sql
│       │   ├── 004_create_checklist_items.sql
│       │   └── 005_create_notes.sql
│       └── src/
│           ├── lib.rs                # Public API re-exports
│           ├── db.rs                 # Pool creation, migration runner
│           ├── models.rs             # Structs: Project, User, Category, ChecklistItem, Note
│           ├── projects.rs           # CRUD: list, add, edit, delete
│           ├── checklist.rs          # Toggle flags, manage subtasks
│           ├── auth.rs               # Login, register, JWT issue/verify
│           ├── notes.rs              # Add, edit, delete notes
│           ├── excel.rs              # Parse Excel → checklist items (calamine)
│           └── errors.rs             # Shared error types
│
├── desktop/                          # Tauri desktop app
│   ├── src-tauri/
│   │   ├── Cargo.toml               # depends on verivia-core
│   │   ├── tauri.conf.json
│   │   └── src/
│   │       ├── main.rs              # Tauri setup + command registration
│   │       ├── commands.rs           # #[tauri::command] fns → call core
│   │       └── watcher.rs           # File system watcher (desktop-only feature)
│   ├── index.html
│   └── ...
│
├── server/                           # Web API (future - NOT built now)
│   ├── Cargo.toml                    # depends on verivia-core
│   └── src/
│       ├── main.rs                   # Axum server setup
│       ├── routes.rs                 # HTTP handlers → call core
│       └── middleware.rs             # JWT auth middleware, CORS
│
└── frontend/                         # React app (shared between desktop & web)
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── api/
        │   └── client.js            # Transport abstraction (invoke vs fetch)
        ├── App.jsx
        ├── main.jsx
        ├── index.css
        ├── auth/
        │   ├── AuthContext.jsx
        │   └── RequireAuth.jsx
        ├── pages/
        │   ├── LoginView.jsx
        │   └── ProjectsView.jsx
        ├── components/
        │   ├── ComplexChecklistModal.jsx
        │   ├── EligibilityModal.jsx
        │   ├── FinanciarModal.jsx
        │   ├── PteModal.jsx
        │   └── TehnicModal.jsx
        ├── fonts/
        └── images/
```

### 3.4 Cargo Workspace

```toml
# /verivia/Cargo.toml
[workspace]
members = [
    "crates/verivia-core",
    "desktop/src-tauri",
    # "server",           # uncomment when building web version
]
```

---

## 4. Database Schema (PostgreSQL)

Replaces `projects.json` and `users.json`.

```sql
-- 001_create_users.sql
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_roles (
    id            SERIAL PRIMARY KEY,
    user_id       INT REFERENCES users(id) ON DELETE CASCADE,
    category      TEXT NOT NULL,                              -- 'eligibilitate', 'financiar', 'tehnic', 'pte/pccvi'
    is_editor     BOOLEAN DEFAULT false,
    is_verificator BOOLEAN DEFAULT false,
    UNIQUE(user_id, category)
);

-- 002_create_projects.sql
CREATE TABLE projects (
    id            SERIAL PRIMARY KEY,
    title         TEXT NOT NULL,
    date          TEXT NOT NULL,                               -- 'MM.DD.YYYY' format (kept for compatibility)
    year          TEXT NOT NULL DEFAULT '2025',
    path          TEXT,                                        -- local folder path (desktop-only, nullable)
    created_at    TIMESTAMPTZ DEFAULT now()
);

-- 003_create_categories.sql
CREATE TABLE categories (
    id            SERIAL PRIMARY KEY,
    project_id    INT REFERENCES projects(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,                               -- 'Eligibilitate', 'Financiar', 'Tehnic', 'PTE/PCCVI'
    excel_path    TEXT,                                        -- only for Tehnic (desktop-only, nullable)
    UNIQUE(project_id, name)
);

-- 004_create_checklist_items.sql
CREATE TABLE checklist_items (
    id            SERIAL PRIMARY KEY,
    category_id   INT REFERENCES categories(id) ON DELETE CASCADE,
    parent_id     INT REFERENCES checklist_items(id) ON DELETE CASCADE,  -- NULL = top-level, non-NULL = subtask
    name          TEXT NOT NULL,
    proposed      BOOLEAN DEFAULT false,
    verified      BOOLEAN DEFAULT false,
    sort_order    INT DEFAULT 0
);

-- Computed status: complete = proposed AND verified (no stored column needed)

-- 005_create_notes.sql
CREATE TABLE notes (
    id            SERIAL PRIMARY KEY,
    item_id       INT REFERENCES checklist_items(id) ON DELETE CASCADE,
    user_email    TEXT NOT NULL,
    text          TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);
```

### 4.1 Schema Design Decisions

| Decision | Rationale |
|----------|-----------|
| **`status` is not stored** | It's derived: `proposed AND verified = complete`. Eliminates inconsistency |
| **`parent_id` self-reference** | SubTasks are just checklist_items with a non-NULL parent_id. Simpler than a separate table |
| **`year` on projects** | Replaces the config.json year-switching mechanism. Simple filter: `WHERE year = '2025'` |
| **`path` and `excel_path` nullable** | These are desktop-only fields (local filesystem). NULL on web |
| **`date` kept as TEXT** | Original format is `MM.DD.YYYY`. Stored as-is to avoid frontend changes. Can be migrated to DATE type later |
| **No `config` table** | Year switching, DB paths, etc. are desktop-only config. Stays in local config.json for Tauri, not in PostgreSQL |

---

## 5. API Layer

### 5.1 Transport Abstraction (`frontend/src/api/client.js`)

```javascript
import { invoke } from "@tauri-apps/api/tauri";

const IS_TAURI = Boolean(window.__TAURI__);

async function call(command, args = {}) {
    if (IS_TAURI) {
        return invoke(command, args);
    }
    // Web mode: command name maps to REST endpoint
    const res = await fetch(`/api/${command}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${localStorage.getItem("token") || ""}`
        },
        body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export const api = {
    // Auth
    login:          (mail, password) => call("auth_login", { mail, password }),
    register:       (mail, password, roles) => call("auth_register", { mail, password, roles }),

    // Projects
    loadProjects:   () => call("load_projects"),
    addProject:     (title, date) => call("add_project", { title, date }),
    editProject:    (id, newTitle, newDate) => call("edit_project", { id, newTitle, newDate }),
    deleteProject:  (id) => call("delete_project", { id }),

    // Checklist
    saveProjects:   (newData) => call("save_projects", { newData }),

    // Years
    listYears:      () => call("list_years"),
    switchYear:     (year) => call("switch_year", { year }),
    getActiveYear:  () => call("get_active_year"),

    // Excel (desktop-only — will throw on web)
    loadTechnicalData: (filePath) => call("load_technical_data", { filePath }),
    saveExcelPath:     (projectId, path) => call("save_excel_path", { projectId, path }),

    // Desktop-only
    openFolder:     (path) => call("open_folder", { path }),
};
```

### 5.2 Command Mapping (Desktop vs Web)

| Frontend call | Desktop (Tauri) | Web (Axum) |
|---------------|-----------------|------------|
| `api.login(mail, pw)` | `invoke("auth_login")` → Rust fn → sqlx | `POST /api/auth_login` → Axum handler → same Rust fn → sqlx |
| `api.loadProjects()` | `invoke("load_projects")` → sqlx | `POST /api/load_projects` → sqlx |
| `api.openFolder(path)` | `shell::open()` | N/A (disabled on web) |
| `api.loadTechnicalData(path)` | `calamine` reads local .xlsx | Web alternative: file upload + server-side parsing |

---

## 6. Auth Strategy

### 6.1 Current (v1)

- Password verified with `bcrypt` in Rust
- On success, entire user object (with roles) stored in `localStorage`
- No token, no expiry, no server-side session
- **Problem:** user can edit localStorage to grant themselves any role

### 6.2 Target (v2)

- Password verified with `bcrypt` in `verivia-core::auth`
- On success, server issues a **JWT** containing `{ user_id, email, roles, exp }`
- JWT stored in `localStorage` (desktop) or `httpOnly cookie` (web)
- Every API call includes the JWT; backend verifies before processing
- Token expiry: 7 days (configurable)
- **Roles are verified server-side on every request**, not trusted from client

### 6.3 Auth Flow

```
Client                        Backend (core::auth)              PostgreSQL
  │                               │                                │
  ├─ login(email, pw) ──────────►│                                │
  │                               ├─ SELECT password_hash ───────►│
  │                               │◄─ hash ──────────────────────│
  │                               ├─ bcrypt::verify(pw, hash)     │
  │                               ├─ SELECT roles WHERE user_id   │
  │                               ├─ jwt::encode({ id, email,     │
  │                               │     roles, exp })              │
  │◄─ { token, user } ───────────│                                │
  │                               │                                │
  ├─ api call + Bearer token ───►│                                │
  │                               ├─ jwt::decode(token)            │
  │                               ├─ check roles for this action   │
  │                               ├─ execute query ───────────────►│
  │◄─ result ─────────────────────│                                │
```

---

## 7. Desktop-Only Features

These features only work in Tauri (desktop) mode. On web, they are either
disabled or replaced with web-compatible alternatives.

| Feature | Desktop (Tauri) | Web Alternative |
|---------|-----------------|-----------------|
| **File dialog** (pick folder/file) | `tauri::api::dialog` | HTML `<input type="file">` |
| **Excel import** | `calamine` crate reads local .xlsx | File upload → server-side parsing with `calamine` via Axum endpoint |
| **Folder watcher** | `notify` crate monitors local directory | Not applicable (no local filesystem in browser) |
| **Open folder** | `shell::open()` opens in OS file manager | Not applicable |
| **PDF save** | `writeBinaryFile()` via Tauri FS API | Browser `<a download>` or `Blob` download |
| **Local config** | `config.json` next to executable | Server-side user preferences table |

---

## 8. Migration Plan (v1 → v2)

### Phase 1: Database (Current priority)

1. Create Neon PostgreSQL account + project
2. Write SQL migrations (schema from Section 4)
3. Add `sqlx` + `jsonwebtoken` to `verivia-core`
4. Implement core functions: `db.rs`, `models.rs`, `auth.rs`, `projects.rs`, `checklist.rs`, `notes.rs`
5. Write a one-time migration script to import existing `projects.json` + `users.json` into PostgreSQL
6. Delete `src/db/users.json` from repo (contains password hashes in public repo)

### Phase 2: Restructure Rust

7. Create Cargo workspace with `verivia-core` crate
8. Move business logic from `main.rs` into core modules
9. Slim down `desktop/src-tauri/main.rs` to thin Tauri command wrappers
10. Keep desktop-only features (watcher, file dialogs) in `desktop/` only

### Phase 3: Frontend Abstraction

11. Create `frontend/src/api/client.js` with `IS_TAURI` detection
12. Replace all `invoke()` calls across components with `api.xxx()` calls
13. Move frontend from `src/` to `frontend/src/`
14. Update `vite.config.js` and `tauri.conf.json` paths accordingly

### Phase 3.5: Granular Operations (Recommended before multi-user)

Move from bulk-save (delete-all + re-insert) to per-item API calls:
- `toggle_flag(item_id, flag, value)` — already in verivia-core, needs Tauri command + frontend wiring
- `add_note(item_id, user, text)` / `edit_note` / `delete_note` — already in verivia-core
- `add_item` / `edit_item` / `delete_item` — already in verivia-core

This eliminates the last-writer-wins problem with concurrent users.
The bulk save approach (`save_category_checklist`) stays as fallback for Excel import.

### Phase 4: Web Server (Future, when needed)

15. Create `server/` with Axum HTTP handlers wrapping `verivia-core`
16. Add JWT middleware, CORS configuration
17. Add file upload endpoint for Excel import (replaces local file dialog)
18. Deploy: React static files on Azure Static Web Apps (free), Axum on Azure App Service
19. Migrate database from Neon to Azure Database for PostgreSQL (change connection string)

---

## 9. Technology Choices

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React 18 + Vite + MUI 7 + Tailwind | Already in use, no reason to change |
| **Desktop shell** | Tauri v1 | Already in use, lightweight, Rust-native |
| **Shared core** | Rust (library crate) | Already in use, reusable across Tauri + Axum |
| **Web server** | Axum (future) | Same language as core (Rust), async, fast, good ecosystem |
| **Database** | PostgreSQL | Industry standard, Azure-native, free on Neon |
| **DB driver** | sqlx | Compile-time checked queries, async, PostgreSQL-native |
| **Auth** | bcrypt + JWT | bcrypt already in use, JWT adds proper token-based auth |
| **Excel parsing** | calamine | Already in use, Rust-native, fast |
| **PDF generation** | jsPDF (frontend) | Already in use, works in both Tauri and browser |

---

## 10. Environment & Deployment

### 10.1 Desktop (Now)

```
User's PC:
  ├── VeriVia.exe (Tauri bundle)
  │     ├── React frontend (embedded)
  │     └── Rust backend (compiled in)
  │           └── connects to → Neon PostgreSQL (cloud, free)
  │
  └── config.json (local paths, year settings)
```

- **Cost:** $0 (Neon free tier: 0.5GB storage)
- **Distribution:** `.msi` / `.exe` installer via GitHub Releases
- **Updates:** Manual download or Tauri updater plugin

### 10.2 Web (Future)

```
Azure Static Web Apps (free):
  └── React SPA (built with Vite)
        └── calls → Azure App Service:
                      └── Axum API (Rust)
                            └── connects to → Azure Database for PostgreSQL
```

- **Cost:** ~$0-5/month (Static Web Apps free, App Service basic, Azure DB cheapest tier)
- **Migration:** Change `DATABASE_URL` from Neon to Azure connection string

---

## 11. Rules & Conventions

### 11.1 Code Organization
- **All business logic** lives in `verivia-core`. Tauri commands and Axum handlers are thin wrappers only.
- **No `invoke()` in components.** All data calls go through `api/client.js`.
- **No `.unwrap()` in core.** Use `Result<T, AppError>` everywhere. `.unwrap()` is only acceptable in tests.
- **One concern per file.** No file should exceed ~300 LOC. If it does, split it.

### 11.2 Database
- **All schema changes** go through numbered migration files in `crates/verivia-core/migrations/`.
- **No raw SQL strings** scattered in code. Queries live in their respective module (projects.rs, auth.rs, etc.).
- **`status` is never stored.** It is always derived as `proposed AND verified`.

### 11.3 Auth
- **Roles are always checked server-side.** Never trust client-supplied role data.
- **JWT is required** for all API calls except `login` and `register`.
- **Passwords** are hashed with bcrypt (cost = 12, default).

### 11.4 Frontend
- **No Tauri imports** outside of `api/client.js` and desktop-only components (TehnicModal Excel dialog, PDF save).
- **State management** stays with React Context + local state. No Redux/Zustand unless complexity demands it.
- **Desktop-only features** must check `IS_TAURI` and gracefully degrade or hide on web.

### 11.5 Git & Workflow
- **Never commit** `.env`, `config.json`, `users.json`, or any file containing credentials/hashes.
- **Connection strings** are passed via environment variable `DATABASE_URL`, never hardcoded.
- **Local git config only** — do not modify global git settings on work machines.
