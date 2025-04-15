import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";

// MUI
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import { RichTreeView } from "@mui/x-tree-view/RichTreeView";
import TextField from "@mui/material/TextField";

// Importă componentele pentru modale
import EligibilityModal from "./EligibilityModal";
import FinanciarModal from "./FinanciarModal";
import PteModal from "./PteModal";
import TehnicModal from "./TehnicModal"; // <-- IMPORT NOU pentru modalul Tehnic

export default function ProjectsView() {
  const [expandedItems, setExpandedItems] = useState([]);
  const [dbData, setDbData] = useState({ projects: [] });

  // State pentru modalul "Add Project"
  const [showModal, setShowModal] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectDate, setNewProjectDate] = useState("");

  // State pentru proiectul selectat
  const [selectedProject, setSelectedProject] = useState(null);

  // State-urile pentru cele 4 modale diferite
  const [showEligibilityModal, setShowEligibilityModal] = useState(false);
  const [showFinanciarModal, setShowFinanciarModal] = useState(false);
  const [showPteModal, setShowPteModal] = useState(false);
  const [showTehnicModal, setShowTehnicModal] = useState(false); // <-- NOU

  async function fetchDbData() {
    try {
      const data = await invoke("load_projects");
      setDbData(data);
    } catch (err) {
      console.error("Eroare la load_projects:", err);
    }
  }

  useEffect(() => {
    fetchDbData();
  }, []);

  // Construiește arborele pentru RichTreeView
  const treeItems = dbData.projects.map((proj) => ({
    id: `proj-${proj.id}`,
    label: `${proj.date} - ${proj.title}`,
    children: proj.categories.map((cat, catIndex) => ({
      id: `cat-${proj.id}-${catIndex}`,
      label: cat.name,
      children: []
    }))
  }));

  const handleExpandedItemsChange = (_, itemIds) => {
    setExpandedItems(itemIds);
  };

  const handleExpandClick = () => {
    if (expandedItems.length === 0) {
      const allIds = [];
      treeItems.forEach((p) => {
        allIds.push(p.id);
        p.children.forEach((c) => {
          allIds.push(c.id);
        });
      });
      setExpandedItems(allIds);
    } else {
      setExpandedItems([]);
    }
  };

  // La selectarea unui nod în arbore
  const handleItemSelect = (_, itemId) => {
    // Ex: itemId = "cat-<projId>-<catIndex>"
    if (itemId.startsWith("cat-")) {
      const parts = itemId.split("-");
      if (parts.length >= 3) {
        const projId = parseInt(parts[1], 10);
        const catIndex = parseInt(parts[2], 10);

        const proj = dbData.projects.find((p) => p.id === projId);
        if (proj && proj.categories[catIndex]) {
          const catName = proj.categories[catIndex].name.toLowerCase();

          // Eligibilitate
          if (catName === "eligibilitate") {
            setSelectedProject(proj);
            setShowEligibilityModal(true);
            return;
          }
          // Financiar
          else if (catName === "financiar") {
            setSelectedProject(proj);
            setShowFinanciarModal(true);
            return;
          }
          // PTE/PCCVI
          else if (catName === "pte/pccvi") {
            setSelectedProject(proj);
            setShowPteModal(true);
            return;
          }
          // Tehnic (cazul NOU)
          else if (catName === "tehnic") {
            setSelectedProject(proj);
            setShowTehnicModal(true);
            return;
          }
        }
      }
    }
    // Dacă e un nod de tip "project" (fără cat-), sau altă categorie,
    // poți pune altă logică aici, dacă e nevoie.
  };

  // Modal "Add Project"
  const handleOpenAddModal = () => {
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setNewProjectTitle("");
    setNewProjectDate("");
  };

  const handleSubmitProject = async () => {
    if (!newProjectTitle.trim() || !newProjectDate.trim()) {
      alert("Te rog completează toate câmpurile.");
      return;
    }
    try {
      await invoke("add_project", {
        title: newProjectTitle,
        date: newProjectDate
      });
      alert("Proiect adăugat cu succes!");
      handleCloseModal();
      fetchDbData();
    } catch (err) {
      console.error("Eroare la add_project:", err);
    }
  };

  // Confirmare modif. ELIGIBILITATE
  const handleEligibilityConfirm = async (updatedTasks) => {
    if (!selectedProject) return;
    const updatedProjects = dbData.projects.map((proj) => {
      if (proj.id === selectedProject.id) {
        const updatedCategories = proj.categories.map((cat) => {
          if (cat.name.toLowerCase() === "eligibilitate") {
            return { ...cat, checklist: updatedTasks };
          }
          return cat;
        });
        return { ...proj, categories: updatedCategories };
      }
      return proj;
    });
    const updatedDbData = { projects: updatedProjects };
    try {
      await invoke("save_projects", {
        new_data: JSON.stringify(updatedDbData, null, 2)
      });
      alert("Modificări salvate cu succes (Eligibilitate)!");
      setDbData(updatedDbData);
    } catch (err) {
      console.error("Eroare la salvarea modificărilor (Eligibilitate):", err);
    }
  };

  // Confirmare modif. FINANCIAR
  const handleFinancialConfirm = async (updatedTasks) => {
    if (!selectedProject) return;
    const updatedProjects = dbData.projects.map((proj) => {
      if (proj.id === selectedProject.id) {
        const updatedCategories = proj.categories.map((cat) => {
          if (cat.name.toLowerCase() === "financiar") {
            return { ...cat, checklist: updatedTasks };
          }
          return cat;
        });
        return { ...proj, categories: updatedCategories };
      }
      return proj;
    });
    const updatedDbData = { projects: updatedProjects };
    try {
      await invoke("save_projects", {
        new_data: JSON.stringify(updatedDbData, null, 2)
      });
      alert("Modificări financiare salvate cu succes!");
      setDbData(updatedDbData);
    } catch (err) {
      console.error("Eroare la salvarea modificărilor financiare:", err);
    }
  };

  // Confirmare modif. PTE/PCCVI
  const handlePteConfirm = async (updatedTasks) => {
    if (!selectedProject) return;
    const updatedProjects = dbData.projects.map((proj) => {
      if (proj.id === selectedProject.id) {
        const updatedCategories = proj.categories.map((cat) => {
          if (cat.name.toLowerCase() === "pte/pccvi") {
            return { ...cat, checklist: updatedTasks };
          }
          return cat;
        });
        return { ...proj, categories: updatedCategories };
      }
      return proj;
    });
    const updatedDbData = { projects: updatedProjects };
    try {
      await invoke("save_projects", {
        new_data: JSON.stringify(updatedDbData, null, 2)
      });
      alert("Modificări PTE/PCCVI salvate cu succes!");
      setDbData(updatedDbData);
    } catch (err) {
      console.error("Eroare la salvarea modificărilor PTE/PCCVI:", err);
    }
  };

  // Confirmare modif. TEHNIC (NOU)
  const handleTehnicConfirm = async (updatedTasks) => {
    if (!selectedProject) return;
    const updatedProjects = dbData.projects.map((proj) => {
      if (proj.id === selectedProject.id) {
        const updatedCategories = proj.categories.map((cat) => {
          if (cat.name.toLowerCase() === "tehnic") {
            return { ...cat, checklist: updatedTasks };
          }
          return cat;
        });
        return { ...proj, categories: updatedCategories };
      }
      return proj;
    });
    const updatedDbData = { projects: updatedProjects };
    try {
      await invoke("save_projects", {
        new_data: JSON.stringify(updatedDbData, null, 2)
      });
      alert("Modificări tehnice salvate cu succes!");
      setDbData(updatedDbData);
    } catch (err) {
      console.error("Eroare la salvarea modificărilor tehnice:", err);
    }
  };

  return (
    <Stack spacing={2} sx={{ backgroundColor: "transparent" }}>
      {/* Butonul de deschidere modal "Add Project" */}
      <Button variant="contained" onClick={handleOpenAddModal}>
        ADAUGĂ PROIECT
      </Button>

      {/* Buton de expand/collapse all */}
      <Button variant="contained" onClick={handleExpandClick}>
        {expandedItems.length === 0 ? "EXPAND ALL" : "COLLAPSE ALL"}
      </Button>

      {/* Arborele cu proiecte și categorii */}
      <Box sx={{ minWidth: 250, backgroundColor: "transparent" }}>
        <RichTreeView
          sx={{
            backgroundColor: "transparent",
            color: "#fff",
            "& .MuiTreeItem-root": {
              backgroundColor: "transparent"
            }
          }}
          items={treeItems}
          expandedItems={expandedItems}
          onExpandedItemsChange={handleExpandedItemsChange}
          onSelectedItemsChange={handleItemSelect}
        />
      </Box>

      {/* Modal "Add Project" */}
      {showModal && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Box
            sx={{
              backgroundColor: "rgba(255, 255, 255, 0.9)",
              borderRadius: 2,
              p: 4,
              boxShadow: "0px 4px 15px rgba(0,0,0,0.3)",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              minWidth: 300
            }}
          >
            <TextField
              label="Nume proiect"
              variant="outlined"
              value={newProjectTitle}
              onChange={(e) => setNewProjectTitle(e.target.value)}
              fullWidth
            />
            <TextField
              label="Data proiect (MM.DD.YYYY)"
              variant="outlined"
              value={newProjectDate}
              onChange={(e) => setNewProjectDate(e.target.value)}
              fullWidth
            />
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Button variant="outlined" onClick={handleCloseModal}>
                Cancel
              </Button>
              <Button variant="contained" onClick={handleSubmitProject}>
                Submit
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {/* Modal "Eligibilitate" */}
      {showEligibilityModal && selectedProject && (
        <EligibilityModal
          open={showEligibilityModal}
          onClose={() => setShowEligibilityModal(false)}
          onConfirm={handleEligibilityConfirm}
          projectTitle={selectedProject.title}
          initialTasks={
            selectedProject.categories.find(
              (cat) => cat.name.toLowerCase() === "eligibilitate"
            )?.checklist
          }
        />
      )}

      {/* Modal "Financiar" */}
      {showFinanciarModal && selectedProject && (
        <FinanciarModal
          open={showFinanciarModal}
          onClose={() => setShowFinanciarModal(false)}
          onConfirm={handleFinancialConfirm}
          projectTitle={selectedProject.title}
          initialTasks={
            selectedProject.categories.find(
              (cat) => cat.name.toLowerCase() === "financiar"
            )?.checklist
          }
        />
      )}

      {/* Modal "PTE/PCCVI" */}
      {showPteModal && selectedProject && (
        <PteModal
          open={showPteModal}
          onClose={() => setShowPteModal(false)}
          onConfirm={handlePteConfirm}
          projectTitle={selectedProject.title}
          initialTasks={
            selectedProject.categories.find(
              (cat) => cat.name.toLowerCase() === "pte/pccvi"
            )?.checklist
          }
        />
      )}

      {/* Modal "Tehnic" (NOU) */}
      {showTehnicModal && selectedProject && (
        <TehnicModal
          open={showTehnicModal}
          onClose={() => setShowTehnicModal(false)}
          onConfirm={handleTehnicConfirm}
          projectTitle={selectedProject.title}
          initialTasks={
            selectedProject.categories.find(
              (cat) => cat.name.toLowerCase() === "tehnic"
            )?.checklist
          }
        />
      )}
    </Stack>
  );
}
