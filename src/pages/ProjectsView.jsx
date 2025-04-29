// src/pages/ProjectsView.jsx
import React, { useState, useEffect, useRef } from "react";
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
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";          // NEW
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined"; // NEW
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline"; // NEW
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import RadioGroup from "@mui/material/RadioGroup";
import Radio from "@mui/material/Radio";
import FormControlLabel from "@mui/material/FormControlLabel";
import LogoutIcon from "@mui/icons-material/Logout";
import Tooltip from "@mui/material/Tooltip";

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
  const [years,       setYears]      = useState([]);  // ex: ["2025","2026",…]
  const [currentYear, setCurrentYear]= useState("");  // anul care e activ
  const [startIdx,    setStartIdx]   = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

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
  const listRef      = useRef(null);
  const [showBackBtn, setShowBackBtn] = useState(false);

  /* ───────────── load DB ───────────── */
  // ───────── ani disponibili ─────────
  const loadYears = async () => {
    try {
      const [ y, active ] = await Promise.all([
        invoke("list_years"),
        invoke("get_active_year")
      ]);
      const sorted = [...y].sort((a, b) => Number(a) - Number(b));
      setYears(sorted);
      // setăm direct anul curent pe ce ne-a trimis backend-ul
      setCurrentYear(active);
    } catch (e) {
      console.error("loadYears:", e);
    }
  };

const handleSwitchYear = async (yr) => {
  try {
    await invoke("switch_year", { year: yr });
    setCurrentYear(yr);
    fetchDbData();           // re-încarcă proiectele
  } catch (e) {
    console.error("switch_year:", e);
  }
};

const handleAddYear = async () => {
  try {
    const newY = await invoke("add_year");    // backend face și switch
    await loadYears();
    setCurrentYear(newY);
    fetchDbData();
  } catch (e) {
    // dacă utilizatorul apasă Cancel ignorăm eroarea
    if (!String(e).startsWith("Anulat")) console.error("add_year:", e);
  }
};
  async function fetchDbData() {
    try {
      const data = await invoke("load_projects");
      setDbData(data);
    } catch (err) {
      console.error("Eroare la load_projects:", err);
    }
  }
  useEffect(() => {
    // 1) ani disponibili şi anul curent
    loadYears();
    // 2) prima încărcare de proiecte
    fetchDbData();

    // 3) ascultăm evenimente din backend
    const unlistenAdded = listen("project_added", () => {
      fetchDbData();
    });

    const unlistenYear = listen("year_switched", (e) => {
      // backend întoarce anul nou în payload
      setCurrentYear(e.payload);
      fetchDbData();
    });

    // 4) cleanup
    return () => {
      unlistenAdded.then((u) => u());
      unlistenYear.then((u) => u());
    };
  }, []);

  useEffect(() => {
      const el = listRef.current;
      if (!el) return;
      const onScroll = () => setShowBackBtn(el.scrollTop > 80); // prag 80 px
      el.addEventListener("scroll", onScroll);
      return () => el.removeEventListener("scroll", onScroll);
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
  // ① correct parameter order, ② close the modal when done
const handleTehnicConfirm = async (updatedTasks) => {
  // save just the tasks (excelPath has already been saved on load/update)
  await saveChecklist(updatedTasks, "tehnic")
  setShowTehnicModal(false)
  fetchDbData();
}


const handleExcelPathSaved = async (newPath) => {
  // 1) Actualizează starea locală
  setDbData((d) => ({
    projects: d.projects.map((p) =>
      p.id !== selectedProject.id
        ? p
        : {
            ...p,
            categories: p.categories.map((cat) =>
              cat.name.toLowerCase() !== "tehnic"
                ? cat
                : { ...cat, excelPath: newPath }
            ),
          }
    ),
  }));
  setSelectedProject((sp) => ({
    ...sp,
    categories: sp.categories.map((cat) =>
      cat.name.toLowerCase() !== "tehnic"
        ? cat
        : { ...cat, excelPath: newPath }
    ),
  }));

  // 2) Reîncarcă datele din backend pentru a asigura sincronizarea
  await fetchDbData();
};

const saveChecklist = async (updatedTasks, catKey, newExcelPath) => {
    if (!selectedProject) return;
    const updatedProjects = dbData.projects.map((proj) => {
      if (proj.id === selectedProject.id) {
        const updatedCategories = proj.categories.map((cat) => {
          if (cat.name.toLowerCase() !== catKey) return cat;
          // pentru Tehnic includem și excelPath:
          return {
          ...cat,
          checklist: updatedTasks,
          ...(newExcelPath !== undefined && { excelPath: newExcelPath })
          };
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
      alert("Modificări salvate!");
      setDbData(updatedDbData);
    } catch (err) {
      console.error("Eroare la salvare:", err);
    }
  };

  /* ───────────── render ───────────── */
  return (
        <Stack
          spacing={2}
          sx={{
            width:        450,   // lăţime constantă
            minWidth:     450,   // nu scădea sub ea
            flexShrink:   0,               // nu te micşora niciodată
            flexGrow:     0,               // nu ocupa spaţiu în plus
            alignSelf:    "flex-end",      // lipeşte-l de dreapta (opţional)
            flex: 1,
            minWidth: 0,
            backgroundColor: "transparent",
            display: "flex",
            flexDirection: "column",
            height: '100vh',
            overflow: 'hidden',
          }}
        >
<Box
  sx={{
    position: "fixed",
    top: 8,
    left: 8,
    display: "flex",
    alignItems: "center",
    gap: 1,
  }}
>
  {/* ← doar dacă sunt mai mult de 3 ani, afișăm săgeata stânga */}
  {years.length > 3 && (
    <IconButton
      size="small"
      disabled={startIdx === 0}
      onClick={() => setStartIdx(i => Math.max(0, i - 1))}
    >
      <ChevronLeftIcon sx={{ color: "#fff" }} />
    </IconButton>
  )}

  {/* anii afișați */}
  {years.slice(startIdx, startIdx + 3).map((yr) => (
    <Box
      key={yr}
      onClick={() => handleSwitchYear(yr)}
      sx={{
        px: 1.5,
        py: 0.5,
        borderRadius: 1,
        cursor: "pointer",
        transition: "all 0.3s ease",
        fontWeight: yr === currentYear ? 700 : 400,
        transform: yr === currentYear ? "scale(1.2)" : "scale(1)",
        color: "#fff",
        backgroundColor: yr === currentYear ? "primary.main" : "transparent",
        "&:hover": {
          transform: "scale(1.5)",
          backgroundColor: yr === currentYear ? "primary.main" : "transparent",
        },
      }}
    >
      {yr}
    </Box>
  ))}

  {/* → doar dacă sunt mai mult de 3 ani, afișăm săgeata dreapta */}
  {years.length > 3 && (
    <IconButton
      size="small"
      disabled={startIdx + 3 >= years.length}
      onClick={() => setStartIdx(i => Math.min(years.length - 3, i + 1))}
    >
      <ChevronRightOutlinedIcon sx={{ color: "#fff" }} />
    </IconButton>
  )}

  {/* butonul de + (pentru adăugare an nou) */}
  <Tooltip title="ADAUGĂ URMĂTORUL AN" arrow enterDelay={200}>
  <IconButton
    size="small"
    onClick={handleAddYear}
    sx={{
      color: "#0f0",
      transition: "transform 0.15s ease-in-out",
      "&:hover": {
        transform: "scale(1.5)",
        backgroundColor: "rgba(0,0,0,0.1)",
      },
    }}
  >
    <AddCircleOutlineIcon fontSize="inherit" />
  </IconButton>
</Tooltip>
</Box>
 {/* === HEADER FIX (buton + search) === */}
 {/* HEADER – 3 rânduri suprapuse */}
 <Box
   sx={{
     position: "sticky",
     top: 4,           // ✱ mai mic decât era
     zIndex: 0,
     pr: 2,
     pt: 1,
     pb: 1,
     backgroundColor: "transparent",
     display: "flex",
     flexDirection: "column",
     gap: 1,
   }}
 >
   {/* rând 1 */}
   <Button fullWidth variant="contained" onClick={handleOpenAddModal}>
     ADAUGĂ PROIECT MANUAL
   </Button>

   <Box sx={{ display: "flex", gap: 1 }}>
      {/* always take 100% if alone, or split 50/50 when back‐to‐top is visible */}
      <Button
        size="small"
        variant="contained"
        onClick={handleExpandClick}
        sx={{
          flex: showBackBtn ? "1 1 50%" : "1 1 100%",
          height: 30,
          transition: "flex .3s ease",
        }}
      >
        {expandedProjects.length === 0 ? "EXPAND ALL" : "COLLAPSE ALL"}
      </Button>

      {/* render this only when you actually need it */}
      {showBackBtn && (
        <Button
          size="small"
          variant="contained"
          onClick={() =>
            listRef.current?.scrollTo({ top: 0, behavior: "smooth" })
          }
          sx={{
            flex: "1 1 50%",
            height: 30,
          }}
        >
          ÎNAPOI SUS
        </Button>
      )}
    </Box>

   {/* rând 3 */}
   <TextField
  fullWidth
  size="small"
  label="Caută proiecte…"
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  sx={{
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 1,
    input: { color: "#fff" },
    "& .MuiInputLabel-root": { color: "#fff" },
    "& .MuiInputLabel-root.Mui-focused": { color: "#fff" }, // label alb cand e focus
    "& .MuiOutlinedInput-notchedOutline": { borderColor: "#fff" },
    "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#fff" },
    "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#fff" }, // border alb cand e focus
  }}
/>
 </Box>

      {/* LISTA PROIECTE */}
      <Box
      ref={listRef}
  sx={{
    flex: 1,               // umple vertical spațiul rămas
    overflowY: "auto",     // scroll doar aici
    pr: 1,
    backgroundColor: "transparent",
    overflowX: 'hidden',
  }}
>
  {dbData.projects
    .filter((proj) =>
      proj.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .map((proj) => {
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
          <Box sx={{ display: "flex", alignItems: "center" }}>
            {/* stânga: săgeată + text */}
            <Box
              onClick={() => toggleExpandProject(proj.id)}
              sx={{
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
                flex: 1,          // ocupă tot spaţiul
                minWidth: 0,      // ★ permite shrink-ul
              }}
            >
              <IconButton size="small" sx={{ color: "#fff", flexShrink: 0 }}>
                {expanded ? <ExpandMoreIcon /> : <ChevronRightIcon />}
              </IconButton>

              <Box
                sx={{
                  ml: 1,
                  pr: 1,
                  whiteSpace: "normal",      // permite wrap
                  overflowWrap: "anywhere",  // rupe şi şiruri lungi
                  wordBreak: "break-word",   // fallback pt. browsere vechi
                }}
              >
                {proj.date} – {proj.title}
              </Box>
            </Box>

            {/* dreapta: butoane */}
            <Box sx={{ display: "flex", gap: 1, flexShrink: 0 }}>
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
          projectPath={selectedProject.path || null}
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
          projectPath={selectedProject.path || null}
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
          projectPath={selectedProject.path || null}
        />
      )}

{showTehnicModal && selectedProject && (
   <TehnicModal
     key={selectedProject.id + '_' + (selectedProject.categories.find(c => c.name.toLowerCase() === 'tehnic')?.excelPath || 'noexcel')}
     open={showTehnicModal}
     mode={modalMode}
     onClose={() => setShowTehnicModal(false)}
     onConfirm={handleTehnicConfirm}
     onExcelPathSaved={handleExcelPathSaved}
     projectId={selectedProject.id}
     projectTitle={selectedProject.title}
     initialTasks={
       selectedProject.categories.find(c => c.name.toLowerCase() === "tehnic")
         ?.checklist ?? []
     }
     excelPath={
       selectedProject.categories.find(c => c.name.toLowerCase() === "tehnic")
         ?.excelPath ?? null
     }
     projectPath={selectedProject.path || null}
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
