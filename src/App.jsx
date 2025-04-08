import React from "react";
import ProjectsView from "./components/ProjectsView";
import "./index.css";

/**
 * Componenta principală a aplicației.
 * Conține doar containerul și panoul “CategoriesPanel” cu ProjectsView.
 */
export default function App() {
  return (
    <div className="AppContainer">
      <div className="CategoriesPanel">
        <ProjectsView />
      </div>
    </div>
  );
}
