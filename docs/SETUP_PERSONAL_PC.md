# VeriVia — Setup pe PC Personal (pas cu pas)

> Acest ghid presupune că ai deja Git, Rust (cargo), Node.js (npm), și Tauri CLI instalate.
> Dacă nu, vezi secțiunea "Prerequisite" de la final.

---

## Pasul 1: Clone / Pull repo

```bash
# Dacă e prima dată:
git clone https://github.com/Spinney20/VeriVia.git
cd VeriVia

# Dacă ai deja repo-ul:
cd VeriVia
git pull origin master
```

Verifică că ai structura nouă:
```bash
ls crates/verivia-core/src/
# Trebuie să vezi: auth.rs checklist.rs db.rs errors.rs excel.rs lib.rs models.rs notes.rs projects.rs
```

---

## Pasul 2: Creează baza de date pe Neon

### 2a. Cont Neon
1. Intră pe https://neon.tech
2. Click "Sign Up" (poți folosi GitHub login)
3. Alege "Free tier"

### 2b. Creează proiect
1. Click "New Project"
2. Nume: `verivia`
3. Region: **EU (Frankfurt)** — cel mai aproape de România
4. PostgreSQL version: default (16)
5. Click "Create Project"

### 2c. Ia connection string-ul
1. Pe pagina proiectului, vezi "Connection Details"
2. Selectează "Pooled connection" (nu "Direct")
3. Copiază connection string-ul. Arată așa:
   ```
   postgres://verivia_owner:parola123@ep-cool-name-123456.eu-central-1.aws.neon.tech/verivia?sslmode=require
   ```
4. **NU-L PUNE PE NICĂIERI PUBLIC.** Doar în fișierul `.env` local.

---

## Pasul 3: Creează tabelele în baza de date

sqlx (biblioteca Rust) verifică query-urile la **compile time** împotriva bazei de date reale.
Asta înseamnă că tabelele trebuie să existe ÎNAINTE de `cargo build`.

### 3a. Deschide SQL Editor-ul Neon
1. În dashboard-ul Neon, click pe "SQL Editor" (sidebar stânga)
2. Asigură-te că ești pe baza de date `verivia`

### 3b. Rulează migrările (copy-paste fiecare bloc)

**Bloc 1 — Users:**
```sql
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
    id             SERIAL PRIMARY KEY,
    user_id        INT REFERENCES users(id) ON DELETE CASCADE,
    category       TEXT NOT NULL,
    is_editor      BOOLEAN DEFAULT false,
    is_verificator BOOLEAN DEFAULT false,
    UNIQUE(user_id, category)
);
```

**Bloc 2 — Projects:**
```sql
CREATE TABLE IF NOT EXISTS projects (
    id         SERIAL PRIMARY KEY,
    title      TEXT NOT NULL,
    date       TEXT NOT NULL,
    year       TEXT NOT NULL DEFAULT '2025',
    path       TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

**Bloc 3 — Categories:**
```sql
CREATE TABLE IF NOT EXISTS categories (
    id         SERIAL PRIMARY KEY,
    project_id INT REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    excel_path TEXT,
    UNIQUE(project_id, name)
);
```

**Bloc 4 — Checklist Items:**
```sql
CREATE TABLE IF NOT EXISTS checklist_items (
    id          SERIAL PRIMARY KEY,
    category_id INT REFERENCES categories(id) ON DELETE CASCADE,
    parent_id   INT REFERENCES checklist_items(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    proposed    BOOLEAN DEFAULT false,
    verified    BOOLEAN DEFAULT false,
    sort_order  INT DEFAULT 0
);
```

**Bloc 5 — Notes:**
```sql
CREATE TABLE IF NOT EXISTS notes (
    id      SERIAL PRIMARY KEY,
    item_id INT REFERENCES checklist_items(id) ON DELETE CASCADE,
    "user"  TEXT NOT NULL,
    date    TEXT NOT NULL,
    text    TEXT NOT NULL
);
```

**Bloc 6 — Indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_project_id ON categories(project_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_category_id ON checklist_items(category_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_parent_id ON checklist_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_notes_item_id ON notes(item_id);
CREATE INDEX IF NOT EXISTS idx_projects_year ON projects(year);
```

**Bloc 7 — sqlx migrations tracking (necesar ca sqlx să nu reaplice migrările):**
```sql
CREATE TABLE IF NOT EXISTS _sqlx_migrations (
    version        BIGINT PRIMARY KEY,
    description    TEXT NOT NULL,
    installed_on   TIMESTAMPTZ NOT NULL DEFAULT now(),
    success        BOOLEAN NOT NULL,
    checksum       BYTEA NOT NULL,
    execution_time BIGINT NOT NULL
);
```

### 3c. Verifică
În SQL Editor, rulează:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```
Trebuie să vezi 7 tabele: `users`, `user_roles`, `projects`, `categories`, `checklist_items`, `notes`, `_sqlx_migrations`.

---

## Pasul 4: Configurează .env

Creează fișierul `.env` **în root-ul proiectului** (lângă `Cargo.toml`):

```bash
# În directorul VeriVia:
cat > .env << 'EOF'
DATABASE_URL=postgres://USER:PAROLA@HOST/DB?sslmode=require
JWT_SECRET=schimba-cu-un-string-random-lung
EOF
```

**Înlocuiește** `DATABASE_URL` cu connection string-ul real de la Pasul 2c.

Pentru `JWT_SECRET`, generează un string random:
```bash
openssl rand -base64 32
```

**IMPORTANT:** Verifică că `.env` NU este tracked de git:
```bash
git status
# .env NU trebuie să apară (e în .gitignore)
```

---

## Pasul 5: npm install

```bash
npm install
```

Asta recreează `node_modules/` (care a fost șters de pe laptopul de muncă).

Verifică:
```bash
ls node_modules/@tauri-apps/api/
# Trebuie să existe
```

---

## Pasul 6: Prima compilare Rust

```bash
cargo build 2>&1 | head -50
```

### Posibile erori și cum le rezolvi:

**Eroare: `feature "shell-open-api" is not valid`**
```
Fix: În src-tauri/Cargo.toml, schimbă "shell-open-api" cu "shell-open".
Tauri v1 poate folosi un alt nume de feature.
```

**Eroare: `cannot find type PgPool in crate verivia_core`**
```
Fix: Verifică că crates/verivia-core/src/lib.rs are linia:
  pub use sqlx::PgPool;
```

**Eroare: `error returned from database: relation "xxx" does not exist`**
```
Fix: Nu ai rulat migrările din Pasul 3. Verifică în Neon SQL Editor.
```

**Eroare: `DATABASE_URL must be set`**
```
Fix: Asigură-te că .env există în root cu DATABASE_URL=...
sqlx citește .env automat la compile time.
```

**Eroare: `the trait bound ... FromRow is not satisfied`**
```
Fix: Verifică structurile din models.rs — câmpurile trebuie să se potrivească
exact cu coloanele din SQL (nume, tip, nullable).
```

**Eroare: `calamine 0.18 ... yanked` sau incompatibilitate versiuni**
```
Fix: Actualizează calamine la ultima versiune în crates/verivia-core/Cargo.toml:
  calamine = "0.26"   (sau ce apare pe crates.io)
Verifică și în src-tauri/Cargo.toml dacă mai e listat acolo (nu ar trebui).
```

**Orice altă eroare de compilare:**
Copiaz-o și trimite-mi-o — o rezolvăm împreună.

---

## Pasul 7: Primul test

```bash
# Varianta 1: doar backend
cargo run -p app

# Varianta 2: full app (frontend + backend)
npm run dev:tauri
```

La prima pornire:
- App-ul se conectează la Neon (poate dura 3-5 secunde — cold start)
- Fereastra Tauri apare
- Ar trebui să vezi pagina de login
- Baza de date e goală — nu sunt proiecte sau useri

---

## Pasul 8: Migrare date existente (opțional)

Dacă vrei să imporți datele din JSON-urile vechi:

```bash
# Migrare projects:
cargo run -p migrate-json -- \
  --projects src/db/projects.json \
  --year 2025

# Migrare users (dacă ai fișierul undeva):
cargo run -p migrate-json -- \
  --users /path/to/users.json

# Sau ambele odată:
cargo run -p migrate-json -- \
  --projects src/db/projects.json \
  --users /path/to/users.json \
  --year 2025
```

Verificare — în Neon SQL Editor:
```sql
SELECT COUNT(*) FROM projects;
SELECT COUNT(*) FROM users;
SELECT email FROM users;
```

---

## Pasul 9: Testează funcționalitățile

### 9a. Login
1. Dacă ai migrat useri → loghează-te cu email-ul existent
2. Dacă n-ai migrat → creează cont nou din Register

### 9b. Proiecte
1. Verifică lista de proiecte (dacă ai migrat, trebuie să apară)
2. Adaugă un proiect manual
3. Editează titlul
4. Șterge un proiect

### 9c. Checklist
1. Deschide o categorie (Eligibilitate)
2. Bifează "proposed" pe un item
3. Apasă OK → trebuie să vezi "Modificări salvate!"
4. Închide modalul, redeschide-l → bifele trebuie să persiste

### 9d. Note
1. Deschide un item, adaugă o notă
2. Salvează
3. Redeschide → nota trebuie să apară

### 9e. Excel (doar dacă ai un .xlsx de test)
1. Deschide categoria Tehnic
2. Importă un Excel
3. Verifică că apar task-urile

### 9f. PDF
1. Bifează toate itemele din o categorie
2. Butonul "Generează Proces Verbal" trebuie să apară
3. Click → salvează PDF → verifică conținutul

---

## Pasul 10: După ce totul merge — commit

```bash
# Dacă ai făcut fix-uri la compile errors:
git add -A
git status  # verifică ce se comite
git commit -m "fix compile errors from initial build"
git push
```

---

## Troubleshooting

### App-ul nu pornește, eroare la conectare DB
- Verifică că DATABASE_URL e corect în .env
- Verifică în Neon dashboard că proiectul e activ (nu suspended)
- Testează conexiunea: `psql "CONNECTION_STRING_AICI"` (dacă ai psql instalat)

### Fereastra e albă / nu se încarcă frontend-ul
- Verifică că `npm install` a rulat
- Verifică că portul 3000 nu e ocupat: `lsof -i :3000`
- Rulează separat: `npm run dev:frontend` și verifică în browser la `http://localhost:3000`

### Login nu funcționează cu user migrat
- Verifică în Neon: `SELECT email, password_hash FROM users;`
- Hash-ul trebuie să înceapă cu `$2b$12$` (bcrypt)
- Parola trebuie să fie cea veche (hash-ul e păstrat exact)

### Proiectele nu apar după migrare
- Verifică anul activ: `SELECT DISTINCT year FROM projects;`
- App-ul afișează doar proiectele din anul curent (default "2025")
- Verifică config.json lângă executabil: `current_year` trebuie să fie "2025"

---

## Prerequisite (dacă nu le ai)

### Rust
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update
```

### Node.js (v18+)
```bash
# Cu nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

### Tauri prerequisites (Linux)
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev build-essential curl wget file \
  libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

### Tauri prerequisites (Windows)
- Instalează Microsoft Visual Studio C++ Build Tools
- Instalează WebView2 (vine cu Windows 10/11 recent)
- Detalii: https://tauri.app/v1/guides/getting-started/prerequisites

### Tauri CLI
```bash
cargo install tauri-cli
```
