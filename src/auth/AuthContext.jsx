import React, { createContext, useContext, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";

const AuthContext = createContext(null);

// ————— hook helper —————
export const useAuth = () => useContext(AuthContext);

// ————— provider —————
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);      // { username, roles: {...} }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("loggedUser");
    if (saved) {
      try {
        setUser(JSON.parse(saved));
      } catch {/* ignore */}
    }
    setLoading(false);
  }, []);

  // ------------ API public ----------------
  const login = async (mail, password, rememberMe = true) => {
    // apelez comanda Rust – poate arunca eroare string
    const loggedUser = await invoke("auth_login", { mail, password });
    setUser(loggedUser);
    if (rememberMe) {
      localStorage.setItem("loggedUser", JSON.stringify(loggedUser));
    }
  };

  const logout = () => {
    localStorage.removeItem("loggedUser");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
