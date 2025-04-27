// src/pages/ProjectsView.jsx
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
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import RadioGroup from "@mui/material/RadioGroup";
import Radio from "@mui/material/Radio";
import FormControlLabel from "@mui/material/FormControlLabel";
import LogoutIcon from "@mui/icons-material/Logout";

// Importă componentele pentru modale
import EligibilityModal from "../components/EligibilityModal";
import FinanciarModal from "../components/FinanciarModal";
import PteModal from "../components/PteModal";
import TehnicModal from "../components/TehnicModal";

import { useAuth }     from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";

export default function ProjectsView() {
  const [expandedProjects, setExpandedProjects] = useState([]);
  const [dbData, setDbData] = useState({ projects: [] });

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const displayName = user?.mail
    ? user.mail
        .split("@")[0]
        .split(".")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ")
    : "";

  /* ───────────── modal‐uri / role mode ───────────── */
  const [modalMode, setModalMode] = useState("editor"); // "editor" | "verificator"
  const [roleDialog, setRoleDialog] = useState({
    open: false,
    mode: "",
    proj: null,
    catIdx: null,
  });

  /* ───────────── state pentru dialogs existente ───────────── */
  const [showModal, setShowModal] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectDate, setNewProjectDate] = useState("");
  const [selectedProject, setSelectedProject] = useState(null);
  const [showEligibilityModal, setShowEligibilityModal] = useState(false);
  const [showFinanciarModal, setShowFinanciarModal] = useState(false);
  const [showPteModal, setShowPteModal] = useState(false);
  const [showTehnicModal, setShowTehnicModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editProjectTitle, setEditProjectTitle] = useState("");
  const [editProjectDate, setEditProjectDate] = useState("");

  /* ───────────── load DB ───────────── */
  async function fetchDbData() {
    try {
      const data = await invoke("load_projects");
      setDbData(data);
    } catch (err) {
      console.error("Eroare la load_projects:", err);
    }
  }
  useEffect(() => {
    fetchDbData(); // îl lăsăm să facă fetch inițial

    const unlistenPromise = listen("project_added", () => {
      fetchDbData(); // și când vine eventul
    });

    return () => {
      // cleanup corect la închiderea componentei
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  /* ───────────── helper × expand/collapse ───────────── */
  const toggleExpandProject = (projectId) => {
    setExpandedProjects((prev) =>
      prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId]
    );
  };
  const handleExpandClick = () => {
    if (expandedProjects.length === 0) {
      setExpandedProjects(dbData.projects.map((p) => p.id));
    } else {
      setExpandedProjects([]);
    }
  };
  const isProjectExpanded = (projectId) => expandedProjects.includes(projectId);

  /* ───────────── open category modal în funcţie de mode ───────────── */
  const openCategoryModal = (proj, catIdx, mode) => {
    setModalMode(mode);
    setSelectedProject(proj);

    const catName = proj.categories[catIdx].name.toLowerCase();
    if (catName === "eligibilitate") {
      setShowEligibilityModal(true);
    } else if (catName === "financiar") {
      setShowFinanciarModal(true);
    } else if (catName === "pte/pccvi") {
      setShowPteModal(true);
    } else if (catName === "tehnic") {
      setShowTehnicModal(true);
    }
  };

  /* ───────────── click pe categorie ───────────── */
  const handleCategoryClick = (proj, catIndex) => {
    const catKey = proj.categories[catIndex].name.toLowerCase();
    const perms = user?.roles?.[catKey] || { editor: false, verificator: false };

    if (perms.editor && perms.verificator) {
      setRoleDialog({ open: true, mode: "", proj, catIdx: catIndex });
      return;
    }
    const mode = perms.editor ? "editor" : "verificator";
    openCategoryModal(proj, catIndex, mode);
  };

  /* ───────────── restul funcţiilor (delete / edit etc.) rămân la fel ───────────── */
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

  const handleEditProject = (proj) => {
    setSelectedProject(proj);
    setEditProjectTitle(proj.title);
    setEditProjectDate(proj.date);
    setShowEditModal(true);
  };

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

  /* ───────────── adăugare proiect – nealterat ───────────── */
  const handleOpenAddModal = () => setShowModal(true);
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

  /* ───────────── confirmări modale (elig./fin./pte/tehnic) – nealterate ───────────── */
  const handleEligibilityConfirm = async (updatedTasks) =>
    saveChecklist(updatedTasks, "eligibilitate");
  const handleFinancialConfirm = async (updatedTasks) =>
    saveChecklist(updatedTasks, "financiar");
  const handlePteConfirm = async (updatedTasks) =>
    saveChecklist(updatedTasks, "pte/pccvi");
  const handleTehnicConfirm = async (updatedTasks) =>
    saveChecklist(updatedTasks, "tehnic");

  const saveChecklist = async (updatedTasks, catKey) => {
    if (!selectedProject) return;
    const updatedProjects = dbData.projects.map((proj) => {
      if (proj.id === selectedProject.id) {
        const updatedCategories = proj.categories.map((cat) =>
          cat.name.toLowerCase() === catKey
            ? { ...cat, checklist: updatedTasks }
            : cat
        );
        return { ...proj, categories: updatedCategories };
      }
      return proj;
    });
    const updatedDbData = { projects: updatedProjects };
    try {
      await invoke("save_projects", {
        new_data: JSON.stringify(updatedDbData, null, 2),
      });
      alert("Modificări salvate!");
      setDbData(updatedDbData);
    } catch (err) {
      console.error("Eroare la salvare:", err);
    }
  };

  /* ───────────── render ───────────── */
  return (
    <Stack spacing={2} sx={{ backgroundColor: "transparent" }}>
      <Button variant="contained" onClick={handleOpenAddModal}>
        ADAUGĂ PROIECT
      </Button>

      <Button variant="contained" onClick={handleExpandClick}>
        {expandedProjects.length === 0 ? "EXPAND ALL" : "COLLAPSE ALL"}
      </Button>

      {/* LISTA PROIECTE */}
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
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", cursor: "pointer" }} onClick={() => toggleExpandProject(proj.id)}>
                  <IconButton
                    size="small"
                    sx={{ color: "#fff" }}
                  >
                    {expanded ? <ExpandMoreIcon /> : <ChevronRightIcon />}
                  </IconButton>
                  <span style={{ marginLeft: 8 }}>
                    {proj.date} - {proj.title}
                  </span>
                </Box>

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
                    <DeleteIcon fontSize="inherit" sx={{ color: "red" }} />
                  </IconButton>
                </Box>
              </Box>

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
                        "&:hover": { backgroundColor: "rgba(255,255,255,0.2)" },
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

          {/* ───────────── DIALOG „ADAUGĂ PROIECT” ───────────── */}
    <Dialog open={showModal} onClose={handleCloseModal}>
      <DialogTitle>Adaugă proiect</DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1, minWidth: 300 }}>
          <TextField
            label="Titlu"
            value={newProjectTitle}
            onChange={(e) => setNewProjectTitle(e.target.value)}
            fullWidth
          />
          <TextField
            label="Data (MM.DD.YYYY)"
            value={newProjectDate}
            onChange={(e) => setNewProjectDate(e.target.value)}
            fullWidth
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleCloseModal}>Anulează</Button>
        <Button variant="contained" onClick={handleSubmitProject}>
          Salvează
        </Button>
      </DialogActions>
    </Dialog>

    {/* ───────────── DIALOG „EDITEAZĂ PROIECT” ───────────── */}
    <Dialog open={showEditModal} onClose={() => setShowEditModal(false)}>
      <DialogTitle>Editează proiect</DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1, minWidth: 300 }}>
          <TextField
            label="Titlu"
            value={editProjectTitle}
            onChange={(e) => setEditProjectTitle(e.target.value)}
            fullWidth
          />
          <TextField
            label="Data (MM.DD.YYYY)"
            value={editProjectDate}
            onChange={(e) => setEditProjectDate(e.target.value)}
            fullWidth
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={() => setShowEditModal(false)}>Anulează</Button>
        <Button variant="contained" onClick={handleSubmitEditProject}>
          Actualizează
        </Button>
      </DialogActions>
    </Dialog>

      {/* ───────────── MODALE existente – doar am adăugat prop mode ───────────── */}
      {showEligibilityModal && selectedProject && (
        <EligibilityModal
          open={showEligibilityModal}
          mode={modalMode}
          onClose={() => setShowEligibilityModal(false)}
          onConfirm={handleEligibilityConfirm}
          projectTitle={selectedProject.title}
          initialTasks={
            selectedProject.categories.find(
              (c) => c.name.toLowerCase() === "eligibilitate"
            )?.checklist
          }
        />
      )}

      {showFinanciarModal && selectedProject && (
        <FinanciarModal
          open={showFinanciarModal}
          mode={modalMode}
          onClose={() => setShowFinanciarModal(false)}
          onConfirm={handleFinancialConfirm}
          projectTitle={selectedProject.title}
          initialTasks={
            selectedProject.categories.find(
              (c) => c.name.toLowerCase() === "financiar"
            )?.checklist
          }
        />
      )}

      {showPteModal && selectedProject && (
        <PteModal
          open={showPteModal}
          mode={modalMode}
          onClose={() => setShowPteModal(false)}
          onConfirm={handlePteConfirm}
          projectTitle={selectedProject.title}
          initialTasks={
            selectedProject.categories.find(
              (c) => c.name.toLowerCase() === "pte/pccvi"
            )?.checklist
          }
        />
      )}

      {showTehnicModal && selectedProject && (
        <TehnicModal
          open={showTehnicModal}
          mode={modalMode}
          onClose={() => setShowTehnicModal(false)}
          onConfirm={handleTehnicConfirm}
          projectId={selectedProject.id}
          projectTitle={selectedProject.title}
          initialTasks={
            selectedProject.categories.find((c) => c.name.toLowerCase() === "tehnic")?.checklist ?? []
          }
          excelPath={
            selectedProject.categories.find((c) => c.name.toLowerCase() === "tehnic")?.excelPath ?? null
          }
        />
      )}

      {/* ───────────── dialog alegere rol ───────────── */}
      <Dialog
        open={roleDialog.open}
        onClose={() => setRoleDialog({ ...roleDialog, open: false })}
      >
        <DialogTitle>Alege rolul cu care intri</DialogTitle>
        <DialogContent>
          <RadioGroup
            value={roleDialog.mode}
            onChange={(_, v) => setRoleDialog((p) => ({ ...p, mode: v }))}
          >
            <FormControlLabel value="editor" control={<Radio />} label="Editor" />
            <FormControlLabel
              value="verificator"
              control={<Radio />}
              label="Verificator"
            />
          </RadioGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoleDialog({ ...roleDialog, open: false })}>
            Anulează
          </Button>
          <Button
            variant="contained"
            disabled={!roleDialog.mode}
            onClick={() => {
              const { proj, catIdx, mode } = roleDialog;
              setRoleDialog({ ...roleDialog, open: false });
              openCategoryModal(proj, catIdx, mode);
            }}
          >
            Continuă
          </Button>
        </DialogActions>
      </Dialog>

      {/* ────────── status utilizator ────────── */}
      <Box
        sx={{
          position: "fixed",
          bottom: 16,
          left: 16,
          display: "flex",
          alignItems: "center",
          gap: 2,
          color: "#fff",
        }}
      >
        <span>
          Conectat ca: <strong>{displayName}</strong>
        </span>

        <Button
          size="small"
          color="error"
          startIcon={<LogoutIcon />}
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          Logout
        </Button>
      </Box>
    </Stack>
  );
}
