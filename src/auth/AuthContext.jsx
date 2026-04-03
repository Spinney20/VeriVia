import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api/client";

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
    const resp = await api.login(mail, password);
    // resp = { token, user: { mail, roles } }
    const loggedUser = resp.user || resp;
    if (resp.token) {
      localStorage.setItem("token", resp.token);
    }
    setUser(loggedUser);
    if (rememberMe) {
      localStorage.setItem("loggedUser", JSON.stringify(loggedUser));
    }
  };

  const logout = () => {
    localStorage.removeItem("loggedUser");
    localStorage.removeItem("token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
