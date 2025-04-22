import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import RequireAuth from "./auth/RequireAuth";

import LoginView    from "./pages/LoginView";
import ProjectsView from "./pages/ProjectsView";

import "./index.css";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginView />} />

        {/* rutele care cer autentificare */}
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
