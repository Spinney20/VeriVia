import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";

// MUI
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

// Importă componentele pentru modale
import EligibilityModal from "./EligibilityModal";
import FinanciarModal from "./FinanciarModal";
import PteModal from "./PteModal";
import TehnicModal from "./TehnicModal"; // <-- NOU pentru modalul Tehnic

export default function ProjectsView() {
  const [expandedProjects, setExpandedProjects] = useState([]);
  // Ține minte care project.id sunt expandate

  const [dbData, setDbData] = useState({ projects: [] });

  // State pentru modalul "Add Project"
  const [showModal, setShowModal] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectDate, setNewProjectDate] = useState("");

  // State pentru proiectul selectat (folosit la modale)
  const [selectedProject, setSelectedProject] = useState(null);

  // State-urile pentru cele 4 modale diferite
  const [showEligibilityModal, setShowEligibilityModal] = useState(false);
  const [showFinanciarModal, setShowFinanciarModal] = useState(false);
  const [showPteModal, setShowPteModal] = useState(false);
  const [showTehnicModal, setShowTehnicModal] = useState(false);

  // ----------------------- NOU: State pentru modalul de Edit -----------------------
  const [showEditModal, setShowEditModal] = useState(false);
  const [editProjectTitle, setEditProjectTitle] = useState("");
  const [editProjectDate, setEditProjectDate] = useState("");

  // --------------------------------------------------------------------------------
  // 1) Load DB
  // --------------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------------
  // 2) Expand / Collapse logic
  // --------------------------------------------------------------------------------
  const toggleExpandProject = (projectId) => {
    setExpandedProjects((prev) =>
      prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId]
    );
  };

  const handleExpandClick = () => {
    if (expandedProjects.length === 0) {
      // Expand ALL
      const allIds = dbData.projects.map((p) => p.id);
      setExpandedProjects(allIds);
    } else {
      // Collapse ALL
      setExpandedProjects([]);
    }
  };

  const isProjectExpanded = (projectId) => {
    return expandedProjects.includes(projectId);
  };

  // --------------------------------------------------------------------------------
  // 3) Când click pe o categorie => deschide modal
  // --------------------------------------------------------------------------------
  const handleCategoryClick = (proj, catIndex) => {
    const catName = proj.categories[catIndex].name.toLowerCase();

    // Eligibilitate
    if (catName === "eligibilitate") {
      setSelectedProject(proj);
      setShowEligibilityModal(true);
      return;
    }
    // Financiar
    if (catName === "financiar") {
      setSelectedProject(proj);
      setShowFinanciarModal(true);
      return;
    }
    // PTE/PCCVI
    if (catName === "pte/pccvi") {
      setSelectedProject(proj);
      setShowPteModal(true);
      return;
    }
    // Tehnic
    if (catName === "tehnic") {
      setSelectedProject(proj);
      setShowTehnicModal(true);
      return;
    }
  };

  // --------------------------------------------------------------------------------
  // 4) Editare / Ștergere Proiect
  // --------------------------------------------------------------------------------
  const handleDeleteProject = async (projectId) => {
    if (!window.confirm("Ești sigur că vrei să ștergi acest proiect?")) return;
    try {
      await invoke("delete_project", { id: projectId });
      alert("Proiect șters cu succes!");
      fetchDbData();
    } catch (err) {
      console.error("Eroare la ștergerea proiectului:", err);
    }
  };

  // ------------------------------ NOU: Deschide modal Edit -------------------------
  const handleEditProject = (proj) => {
    // Setăm datele existente în state
    setSelectedProject(proj);
    setEditProjectTitle(proj.title);
    setEditProjectDate(proj.date);
    setShowEditModal(true);
  };

  // --------------------------- NOU: Confirma modificările Edit ---------------------
  const handleSubmitEditProject = async () => {
    if (!editProjectTitle.trim() || !editProjectDate.trim()) {
      alert("Te rog completează toate câmpurile.");
      return;
    }

    try {
      await invoke("edit_project", {
        id: selectedProject.id,
        newTitle: editProjectTitle,
        newDate: editProjectDate,
      });
      alert("Proiect modificat cu succes!");
      setShowEditModal(false);
      fetchDbData();
    } catch (err) {
      console.error("Eroare la modificarea proiectului:", err);
    }
  };

  // --------------------------------------------------------------------------------
  // 5) Add Project modal
  // --------------------------------------------------------------------------------
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
        date: newProjectDate,
      });
      alert("Proiect adăugat cu succes!");
      handleCloseModal();
      fetchDbData();
    } catch (err) {
      console.error("Eroare la add_project:", err);
    }
  };

  // --------------------------------------------------------------------------------
  // 6) Confirmare modificări (din modale)
  // --------------------------------------------------------------------------------
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
        new_data: JSON.stringify(updatedDbData, null, 2),
      });
      alert("Modificări salvate cu succes (Eligibilitate)!");
      setDbData(updatedDbData);
    } catch (err) {
      console.error("Eroare la salvarea modificărilor (Eligibilitate):", err);
    }
  };

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
        new_data: JSON.stringify(updatedDbData, null, 2),
      });
      alert("Modificări financiare salvate cu succes!");
      setDbData(updatedDbData);
    } catch (err) {
      console.error("Eroare la salvarea modificărilor financiare:", err);
    }
  };

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
        new_data: JSON.stringify(updatedDbData, null, 2),
      });
      alert("Modificări PTE/PCCVI salvate cu succes!");
      setDbData(updatedDbData);
    } catch (err) {
      console.error("Eroare la salvarea modificărilor PTE/PCCVI:", err);
    }
  };

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
        new_data: JSON.stringify(updatedDbData, null, 2),
      });
      alert("Modificări tehnice salvate cu succes!");
      setDbData(updatedDbData);
    } catch (err) {
      console.error("Eroare la salvarea modificărilor tehnice:", err);
    }
  };

  // --------------------------------------------------------------------------------
  // 7) Render
  // --------------------------------------------------------------------------------
  return (
    <Stack spacing={2} sx={{ backgroundColor: "transparent" }}>
      {/* Butonul de deschidere modal "Add Project" */}
      <Button variant="contained" onClick={handleOpenAddModal}>
        ADAUGĂ PROIECT
      </Button>

      {/* Buton de expand/collapse all */}
      <Button variant="contained" onClick={handleExpandClick}>
        {expandedProjects.length === 0 ? "EXPAND ALL" : "COLLAPSE ALL"}
      </Button>

      {/* Afișarea proiectelor (manual) */}
      <Box sx={{ minWidth: 250, backgroundColor: "transparent" }}>
        {dbData.projects.map((proj) => {
          const expanded = isProjectExpanded(proj.id);

          return (
            <Box
              key={proj.id}
              sx={{
                mb: 2,
                p: 1,
                border: "1px solid #888",
                borderRadius: 1,
                backgroundColor: "transparent",
                color: "#fff",
              }}
            >
              {/* Row cu titlul proiectului și butoanele Edit/Delete */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                {/* Stânga: buton expand + text proiect */}
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  <IconButton
                    size="small"
                    onClick={() => toggleExpandProject(proj.id)}
                    sx={{ color: "#fff" }}
                  >
                    {expanded ? <ExpandMoreIcon /> : <ChevronRightIcon />}
                  </IconButton>
                  <span>
                    {proj.date} - {proj.title}
                  </span>
                </Box>

                {/* Dreapta: butoane Edit / Delete */}
                <Box sx={{ display: "flex", gap: 1 }}>
                  <IconButton
                    size="small"
                    sx={{ color: "#fff" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditProject(proj);
                    }}
                  >
                    <EditIcon fontSize="inherit" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteProject(proj.id);
                    }}
                  >
                    {/* Icon roșu */}
                    <DeleteIcon fontSize="inherit" sx={{ color: "red" }} />
                  </IconButton>
                </Box>
              </Box>

              {/* Listează categoriile doar dacă expandat */}
              {expanded && (
                <Box sx={{ ml: 4, mt: 1 }}>
                  {proj.categories.map((cat, catIndex) => (
                    <Box
                      key={catIndex}
                      sx={{
                        mt: 1,
                        cursor: "pointer",
                        p: 1,
                        borderRadius: 1,
                        "&:hover": {
                          backgroundColor: "rgba(255,255,255,0.2)",
                        },
                      }}
                      onClick={() => handleCategoryClick(proj, catIndex)}
                    >
                      {cat.name}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          );
        })}
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
            justifyContent: "center",
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
              minWidth: 300,
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

      {/* Modal "Edit Project" - NOU */}
      {showEditModal && selectedProject && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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
              minWidth: 300,
            }}
          >
            <TextField
              label="Nume proiect"
              variant="outlined"
              value={editProjectTitle}
              onChange={(e) => setEditProjectTitle(e.target.value)}
              fullWidth
            />
            <TextField
              label="Data proiect (MM.DD.YYYY)"
              variant="outlined"
              value={editProjectDate}
              onChange={(e) => setEditProjectDate(e.target.value)}
              fullWidth
            />
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Button
                variant="outlined"
                onClick={() => {
                  setShowEditModal(false);
                }}
              >
                Cancel
              </Button>
              <Button variant="contained" onClick={handleSubmitEditProject}>
                Confirm Edit
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
