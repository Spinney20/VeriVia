// src/App.jsx
import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { invoke } from "@tauri-apps/api/tauri";
import Box from "@mui/material/Box";

import { AuthProvider } from "./auth/AuthContext";
import RequireAuth   from "./auth/RequireAuth";

import LoginView     from "./pages/LoginView";
import ProjectsView  from "./pages/ProjectsView";

import "./index.css";

export default function App() {
  const [paths, setPaths] = useState({ db: "", users: "" });

  useEffect(() => {
    // 1) deschide dialogul pentru projects.json dacă e nevoie
    invoke("load_projects")
      // 2) apoi dialogul pentru users.json
      .then(() => invoke("load_users"))
      // 3) în final citește config.json și pune în state
      .then(() => invoke("load_config"))
      .then(([dbPath, usersPath]) => {
        setPaths({ db: dbPath, users: usersPath });
      })
      .catch(console.error);
  }, []);

  return (
    <AuthProvider>

      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginView />} />

          <Route element={<RequireAuth />}>
            <Route
              path="/*"
              element={
                <div className="AppContainer">
                  <div className="CategoriesPanel">
                    <ProjectsView />
                  </div>
                </div>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
