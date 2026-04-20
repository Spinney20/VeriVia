/**
 * Transport abstraction layer.
 *
 * Desktop (Tauri): calls go through invoke() — direct IPC to the Rust backend.
 * Web (future):    calls go through fetch() — HTTP to an Axum API server.
 *
 * Every component should import from here instead of using invoke() directly.
 */

const IS_TAURI = Boolean(
    typeof window !== "undefined" && window.__TAURI__
);

// Lazy-cached reference to Tauri's invoke function
let _invoke = null;

async function getTauriInvoke() {
    if (!_invoke) {
        const tauri = await import("@tauri-apps/api/tauri");
        _invoke = tauri.invoke;
    }
    return _invoke;
}

/**
 * Generic call — routes to Tauri invoke or HTTP fetch
 */
async function call(command, args = {}) {
    if (IS_TAURI) {
        const invoke = await getTauriInvoke();
        return invoke(command, args);
    }

    // Web mode: POST to /api/<command>
    const token = localStorage.getItem("token") || "";
    const res = await fetch(`/api/${command}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(args),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
    }

    // Some endpoints return empty body
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return res.json();
    }
    return null;
}

// ─────────────────────────── Public API ───────────────────────────

export const api = {
    // Auth
    login: (mail, password) => call("auth_login", { mail, password }),
    register: (mail, password, roles) => call("auth_register", { mail, password, roles }),

    // Projects
    loadProjects: () => call("load_projects"),
    addProject: (title, date) => call("add_project", { title, date }),
    editProject: (id, newTitle, newDate) => call("edit_project", { id, newTitle, newDate }),
    deleteProject: (id) => call("delete_project", { id }),

    // Checklist — save a single category's checklist
    saveChecklist: (projectId, categoryName, items) =>
        call("save_checklist", { projectId, categoryName, items }),

    // Years
    listYears: () => call("list_years"),
    switchYear: (year) => call("switch_year", { year }),
    getActiveYear: () => call("get_active_year"),
    addYear: () => call("add_year"),

    // Config
    loadConfig: () => call("load_config"),
    loadUsers: () => call("load_users"),

    // Excel (desktop-only)
    loadTechnicalData: (filePath) => call("load_technical_data", { filePath }),
    saveExcelPath: (projectId, path) =>
        call("save_excel_path", { projectId, path }),

    // Folder (desktop-only)
    openFolder: (path) => call("open_folder", { path }),
    saveProjectFolder: (projectId, folder) =>
        call("save_project_folder", { projectId, folder }),
};

export { IS_TAURI };
