// src/components/ComplexChecklistModal.jsx
import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  Typography,
  IconButton,
  Button,
  TextField,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
} from "@mui/material";

import Badge             from "@mui/material/Badge";
import CloseIcon         from "@mui/icons-material/Close";
import ArrowRightIcon    from "@mui/icons-material/ArrowRight";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import EditIcon          from "@mui/icons-material/Edit";
import DeleteIcon        from "@mui/icons-material/Delete";
import NoteIcon          from "@mui/icons-material/NoteAdd";
import LockIcon          from "@mui/icons-material/Lock";
import Tooltip           from "@mui/material/Tooltip";

import { invoke } from "@tauri-apps/api/tauri";

// pentru PDF
import antet from "../images/viarom_antet.jpg";
import { save } from "@tauri-apps/api/dialog";
import { writeBinaryFile } from "@tauri-apps/api/fs";
import { jsPDF } from "jspdf";

// ▸ spune bundler-ului să copieze fişierele în /dist şi să-ţi dea URL-ul lor
import RobotoRegURL  from "../fonts/Roboto-Regular.ttf?url";
import RobotoBoldURL from "../fonts/Roboto-Bold.ttf?url";

// ▸ PNG-ul bifă ce apare în listă şi în PDF
import checkboxPNG   from "../images/checkbox.png";

const LockedCheckbox = React.forwardRef(
  ({ lock, sx, ...others }, ref) => (
    <Box
      sx={{
        position: "relative",
        display:  "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width:  40,
        height: 40,
      }}
    >
      <Checkbox
        ref={ref}
        disableRipple
        sx={{
          p: 0,
          // when indeterminate, make the little dash red
          "&.MuiCheckbox-indeterminate .MuiSvgIcon-root": {
            color: "#c62828",
          },
          // keep existing checked color
          "&.Mui-checked": {
            color: "#1976d2",
          },
          ...sx,
        }}
        {...others}
      />
      {lock && (
        <LockIcon
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            fontSize: 15,
            opacity: 0.5,
            pointerEvents: "none",
          }}
        />
      )}
    </Box>
  )
);

const ActionIcon = ({ title, color = "inherit", onClick, children }) => (
  <Tooltip title={title} arrow enterDelay={200}>
    <IconButton
      size="small"
      onClick={onClick}
      sx={{
        color,
        transition: "transform .15s ease-in-out",
        "&:hover": {
          transform: "scale(1.5)",
          backgroundColor: "rgba(0,0,0,0.04)",
        },
      }}
    >
      {children}
    </IconButton>
  </Tooltip>
);


export default function ComplexChecklistModal({
  open,
  onClose,
  onConfirm,
  /* ───────── nou: rolul utilizatorului ───────── */
  mode = "editor", // "editor" | "verificator"
  /* ───────────────────────────────────────────── */
  projectTitle = "Titlu Proiect",
  userName,
  categoryName = "Eligibilitate",
  initialTasks = [],
  excelPath = null,
  children,
  projectPath = null,
}) {
  // -----------------------------------------------------
  // HOOKS & STATE
  // -----------------------------------------------------
  const [dbData, setDbData]               = useState(null);
  const [items, setItems]                 = useState([]);
  const [expanded, setExpanded]           = useState([]);
  const [newMainTask, setNewMainTask]     = useState("");
  const [newSubtask, setNewSubtask]       = useState("");
  const [searchTerm, setSearchTerm]       = useState("");
  const [auditLog, setAuditLog]           = useState([]);

  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [editingTask, setEditingTask]     = useState(null); // {type,itemIndex,subIndex,originalName}
  const [editName, setEditName]           = useState("");

  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [notesValue, setNotesValue]       = useState("");
  const [notesTarget, setNotesTarget]     = useState(null);
  const [editingNote, setEditingNote] = useState(null); // index sau null

  // -----------------------------------------------------
  // Roluri
  // -----------------------------------------------------
  const isEditor      = mode === "editor";
  const isVerificator = mode === "verificator";

  // -----------------------------------------------------
  // 0) Helper: stări checkbox
  // -----------------------------------------------------
  const getParentCheckboxState = (item) => {
    const hasSub = item.subTasks && item.subTasks.length > 0;
    if (!hasSub) return { checked: item.status === "complete", indeterminate: false };
    const all  = item.subTasks.every((st) => st.status === "complete");
    const some = item.subTasks.some((st) => st.status === "complete");
    return { checked: all, indeterminate: some && !all };
  };

  const toB64 = (ab) => {
    const bytes = new Uint8Array(ab);
    const CHUNK = 0x8000;
    let binary  = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  };

  const exportReport = async () => {
    /* -------------------- DIALOG SALVARE -------------------- */
    const outPath = await save({
      title: "Salvează raportul PDF",
      defaultPath: `Verivia_${categoryName}_${projectTitle}.pdf`,
      filters: [{ name: "Fișiere PDF", extensions: ["pdf"] }],
    });
    if (!outPath) return;

    /* -------------------- INIT DOCUMENT -------------------- */
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const left = 20;
    const right = 20;
    const headerY = 15;
    const headerH = 25;
    const lineH = 8;
    const iconSize = 4;

    /* -------------------- FONTS -------------------- */
    const [regBuf, boldBuf] = await Promise.all([
      fetch(RobotoRegURL).then((r) => r.arrayBuffer()),
      fetch(RobotoBoldURL).then((r) => r.arrayBuffer()),
    ]);
    const toB64 = (ab) => {
      const bytes = new Uint8Array(ab);
      const CHUNK = 0x8000;
      let binary = "";
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
      }
      return btoa(binary);
    };
    doc.addFileToVFS("Roboto-Regular.ttf", toB64(regBuf));
    doc.addFileToVFS("Roboto-Bold.ttf", toB64(boldBuf));
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");

    /* -------------------- HELPERS -------------------- */
    //  👉 Returnează Y‑ul separatorului, astfel încât să putem ancora corect restul conținutului
    const drawHeader = async () => {
      doc.setFillColor(245, 245, 245);
      doc.rect(0, headerY - 5, pageW, headerH, "F");

      // logo stânga
      const logo = await loadImg(antet);
      const logoH = 12;
      const logoW = logoH * 4.8;
      doc.addImage(logo, "PNG", left, headerY, logoW, logoH);

      // titlu dreapta
      doc.setFont("Roboto", "bold").setFontSize(20).setTextColor(40);
      doc.text("Raport Verificare Verivia", pageW - right, headerY + 7, {
        align: "right",
      });

      // proiect + categorie – le împachetăm și calculăm înălțimea reală
      const maxCenterWidth = pageW - left - right;

      doc.setFont("Roboto", "bold").setFontSize(17).setTextColor(70);
      const projectLines = doc.splitTextToSize(projectTitle, maxCenterWidth);
      const projLineH = doc.getTextDimensions("A").h; // mm
      let currentY = headerY + 27;
      doc.text(projectLines, pageW / 2, currentY, { align: "center" });
      currentY += projectLines.length * projLineH + 2; // mic spațiu

      doc.setFont("Roboto", "normal").setFontSize(15).setTextColor(100);
      const categoryLines = doc.splitTextToSize(categoryName, maxCenterWidth);
      const catLineH = doc.getTextDimensions("A").h;
      doc.text(categoryLines, pageW / 2, currentY, { align: "center" });
      currentY += categoryLines.length * catLineH;

      // separator exact sub blocul complet
      currentY += 4; // spațiu
      doc.setDrawColor(200);
      doc.line(left, currentY, pageW - right, currentY);

      return currentY; // returnăm Y‑ul separatorului
    };

    const today = new Date().toLocaleDateString("ro-RO");
    const drawFooter = (pageNo, totalPages) => {
      doc.setDrawColor(200);
      doc.line(left, pageH - 22, pageW - right, pageH - 22);

      doc.setFontSize(10);

      // "Verificat de" – negru
      doc.setTextColor(0);
      doc.text(`Verificat de: ${userName || "_________"}`, left, pageH - 17);

      doc.setTextColor(100);
      doc.text(`Data generării: ${today}`, pageW / 2, pageH - 17, {
        align: "center",
      });
      doc.text(`Pag. ${pageNo} / ${totalPages}`, pageW - right, pageH - 17, {
        align: "right",
      });
    };

    /* -------------------- HEADER PAGINA 1 -------------------- */
    const firstSeparatorY = await drawHeader();

    /* -------------------- LISTA TASK-URI -------------------- */
    const checkImg = await loadImg(checkboxPNG);
    let y = firstSeparatorY + 10; // ↙ pornim la 10 mm sub separatorul real

    doc.setFont("Roboto", "normal").setFontSize(13).setTextColor(20);

    const addRow = (txt, lvl) => {
      const startX = left + lvl * 8;
      const maxWidth = pageW - right - startX - iconSize - 2;
      const lines = doc.splitTextToSize(txt, maxWidth);

      lines.forEach((line, idx) => {
        if (y > pageH - 30) {
          y += lineH;
          doc.addPage();
          y = headerY + 10;
          awaitHeaderIfFirst();
        }

        if (idx === 0) {
          doc.addImage(checkImg, "PNG", startX, y - iconSize + 1, iconSize, iconSize);
          doc.text(line, startX + iconSize + 2, y);
        } else {
          doc.text(line, startX + iconSize + 2, y);
        }
        y += lineH;
      });
    };

    let headerDrawnSecondTime = false;
    const awaitHeaderIfFirst = async () => {
      if (!headerDrawnSecondTime) {
        await drawHeader();
        headerDrawnSecondTime = true;
      } else {
        doc.setDrawColor(200);
        doc.line(left, headerY + 5, pageW - right, headerY + 5);
      }
    };

    items.forEach((t) => {
      addRow(t.name, 0);
      t.subTasks?.forEach((s) => addRow(s.name, 1));
    });

    /* -------------------- FOOTER PE TOATE PAGINILE -------------------- */
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      drawFooter(p, totalPages);
    }

    /* -------------------- SALVARE -------------------- */
    try {
      const buf = doc.output("arraybuffer");
      await writeBinaryFile({ path: outPath, contents: new Uint8Array(buf) });
      alert("Raport salvat cu succes!");
    } catch (e) {
      console.error("Eroare la scriere PDF:", e);
      alert("Nu am reuşit să salvez PDF-ul.\nVezi consola pentru detalii.");
    }
  };

  const loadImg = (src) =>
    new Promise((res) => {
      const img = new Image();
      img.src = src;
      img.onload = () => res(img);
    });

  const getFlagState = (item, flag) => {
    if (!item.subTasks || item.subTasks.length === 0)
      return { checked: item[flag], indeterminate: false };
    const all  = item.subTasks.every((st) => st[flag]);
    const some = item.subTasks.some((st) => st[flag]);
    return { checked: all, indeterminate: some && !all };
  };

  // -----------------------------------------------------
  // 1) Load data
  // -----------------------------------------------------
  useEffect(() => {
    async function fetchData() {
      try {
        const data = await invoke("load_projects");
        setDbData(data);

        const project  = data.projects?.find((p) => p.title === projectTitle);
        if (!project) return;

        const category = project.categories?.find((c) => c.name === categoryName);
        if (!category) return;

        const raw =
(categoryName === "Tehnic" && initialTasks?.length)      ? initialTasks
: (category.checklist?.length)                             ? category.checklist
                                                           : initialTasks;

        const addFlags = (t) => ({
          ...t,
          proposed : typeof t.proposed  === "boolean" ? t.proposed  : false,
          verified : typeof t.verified  === "boolean" ? t.verified  : false,
          notes    : Array.isArray(t.notes) ? t.notes : [],
          subTasks : (t.subTasks ?? []).map(addFlags),
        });
        const fixStatus = (t) => {
          t.status = t.proposed && t.verified ? "complete" : "incomplete";
          t.subTasks.forEach(fixStatus);
        };
        const hasNotes = (obj) => obj.notes && obj.notes.length > 0;

        const ready = raw.map(addFlags);
        ready.forEach(fixStatus);

        setItems(ready);
        setAuditLog([]);
      } catch (err) {
        console.error("Eroare la încărcare:", err);
      }
    }

    if (open) {
      fetchData();
      window.addEventListener("beforeunload", handleBeforeUnload);
    }
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [open, projectTitle, categoryName, initialTasks]);

  // -----------------------------------------------------
  // 2) Interceptare închidere
  // -----------------------------------------------------
  const handleBeforeUnload = (e) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = "Ai modificări nesalvate.";
    }
  };
  const handleRequestClose = () => {
    hasUnsavedChanges ? setShowCloseConfirm(true) : onClose();
  };
  const confirmCloseWithoutSave = () => {
    setShowCloseConfirm(false);
    onClose();
  };

  // -----------------------------------------------------
  // 3) Expand / Collapse
  // -----------------------------------------------------
  const isExpanded = (i) => expanded.includes(i);
  const toggleExpand = (i) =>
    setExpanded((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));

  // -----------------------------------------------------
  // 4) Toggle flag (rol‑aware)
  // -----------------------------------------------------
  const toggleFlag = (pIdx, sIdx, flag, val) => {
    if (isVerificator && flag === "proposed") return;
    if (isEditor      && flag === "verified") return;

    if (flag === "verified" && val) {
      const target = sIdx == null ? items[pIdx] : items[pIdx].subTasks[sIdx];
      if (!target.proposed) return;
    }

    setHasUnsavedChanges(true);
    setItems((prev) => {
      const clone = structuredClone(prev);
      const parent = clone[pIdx];

      const updateStatus = (t) => {
        t.status = t.proposed && t.verified ? "complete" : "incomplete";
      };

      if (sIdx == null) {
        parent[flag] = val;
        parent.subTasks.forEach((st) => {
          st[flag] = val;
          updateStatus(st);
        });
        updateStatus(parent);
      } else {
        const sub = parent.subTasks[sIdx];
        sub[flag] = val;
        updateStatus(sub);

        parent[flag] = parent.subTasks.length > 0 &&
                       parent.subTasks.every((st) => st[flag]);
        updateStatus(parent);
      }
      return clone;
    });

    addAuditLog(pIdx, sIdx, `${flag} → ${val}`);
  };

  /* ───────── helpers note ───────── */
const currentObj = (draft = items) => {
  if (!notesTarget) return null;
  const { type, itemIndex, subIndex } = notesTarget;
  return type === "parent"
    ? draft[itemIndex]
    : draft[itemIndex].subTasks[subIndex];
};

const mutateNotes = (fn) => {
  setItems((prev) => {
    const n = structuredClone(prev);
    fn(currentObj(n).notes);
    return n;
  });
};

/* să avem la îndemână un test rapid */
const hasNotes = (obj) => obj?.notes?.length > 0;

const startEditNote = (idx) => {
  setEditingNote(idx);
  setNotesValue(currentObj().notes[idx].text);
};

const deleteNote = (idx) => {
  if (!window.confirm("Ștergi nota?")) return;
  setHasUnsavedChanges(true);
  mutateNotes((arr) => arr.splice(idx, 1));
};

  // -----------------------------------------------------
  // 5) Toggle status (complete/incomplete)
  // -----------------------------------------------------
  const handleToggleParent = (idx, val) => {
    setHasUnsavedChanges(true);
    setItems((prev) => {
      const n = structuredClone(prev);
      n[idx].status = val ? "complete" : "incomplete";
      n[idx].subTasks.forEach((st) => (st.status = n[idx].status));
      return n;
    });
  };
  const handleToggleChild = (pi, si, val) => {
    setHasUnsavedChanges(true);
    setItems((prev) => {
      const n = structuredClone(prev);
      n[pi].subTasks[si].status = val ? "complete" : "incomplete";
      const all = n[pi].subTasks.every((s) => s.status === "complete");
      n[pi].status = all ? "complete" : "incomplete";
      return n;
    });
  };

  // -----------------------------------------------------
  // 6) Add / Edit / Delete – doar editorul
  // -----------------------------------------------------
  const canMutate = isEditor;

  const handleAddMainTask = () => {
    if (!canMutate || !newMainTask.trim()) return;
    setHasUnsavedChanges(true);
    setItems((p) => [
      ...p,
      {
        name: newMainTask,
        status: "incomplete",
        proposed: false,
        verified: false,
        subTasks: [],
        notes: [],
      },
    ]);
    setNewMainTask("");
  };

  const handleAddSubtask = (idx) => {
    if (!canMutate || !newSubtask.trim()) return;
    setHasUnsavedChanges(true);
    setItems((prev) => {
      const n = structuredClone(prev);
      n[idx].subTasks.push({
        name: newSubtask,
        status: "incomplete",
        proposed: false,
        verified: false,
        subTasks: [],
        notes: [],
      });
      return n;
    });
    setNewSubtask("");
  };

  const handleDeleteTask = (idx) => {
    if (!canMutate) return;
    setHasUnsavedChanges(true);
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };
  const handleDeleteSubtask = (pi, si) => {
    if (!canMutate) return;
    setHasUnsavedChanges(true);
    setItems((prev) => {
      const n = structuredClone(prev);
      n[pi].subTasks.splice(si, 1);
      return n;
    });
  };

  const startEdit = (type, i, j, name) =>
    canMutate && setEditingTask({ type, itemIndex: i, subIndex: j, originalName: name });
  const saveEdit = () => {
    if (!editingTask || !editName.trim()) return;
    setHasUnsavedChanges(true);
    setItems((prev) => {
      const n = structuredClone(prev);
      if (editingTask.type === "parent")
        n[editingTask.itemIndex].name = editName;
      else n[editingTask.itemIndex].subTasks[editingTask.subIndex].name = editName;
      return n;
    });
    setEditingTask(null);
  };
  const cancelEdit = () => setEditingTask(null);

  // -----------------------------------------------------
  // 7) Note & audit
  // -----------------------------------------------------
  const openNotes = (type, i, j) => {
    setNotesTarget({ type, itemIndex: i, subIndex: j });
    setNotesValue("");
    setShowNotesDialog(true);
  };
  const saveNotes = () => {
    if (!notesTarget || !notesValue.trim()) return;
    setHasUnsavedChanges(true);

    mutateNotes((arr) => {
      if (editingNote !== null) {
        // EDIT
        arr[editingNote].text = notesValue;
        arr[editingNote].date = new Date().toLocaleString();
      } else {
        // ADD
        arr.push({
          user: userName,
          date: new Date().toLocaleString(),
          text: notesValue,
        });
      }
    });

    setNotesValue("");
    setEditingNote(null);
  };

  const addAuditLog = (itemIndex, subIndex, action) =>
    setAuditLog((p) => [
      ...p,
      { time: new Date().toLocaleString(), user: userName, itemIndex, subIndex, action },
    ]);

  // -----------------------------------------------------
  // 8) Salvare finală – parametru corect: new_data
  // -----------------------------------------------------
  const handleSave = async () => {
    if (!dbData) return;
    const updated = { ...dbData };
    const pIdx = updated.projects?.findIndex((p) => p.title === projectTitle);
    if (pIdx === -1) return;
    const cIdx = updated.projects[pIdx].categories?.findIndex(
      (c) => c.name === categoryName
    );
    if (cIdx === -1) return;

    const cat = updated.projects[pIdx].categories[cIdx];
    cat.checklist = items;

    if (excelPath) {
      cat.excelPath = excelPath;
    }

    try {
      await invoke("save_projects", {
        new_data: JSON.stringify(updated, null, 2),
        newData : JSON.stringify(updated, null, 2),
      });
      console.log("Salvat cu succes");
      setHasUnsavedChanges(false);
      onConfirm && onConfirm(items);
      onClose();
    } catch (err) {
      console.error("Eroare la salvare:", err);
    }
  };

  // -----------------------------------------------------
  // 9) Filtrare & progres
  // -----------------------------------------------------
  const getFilteredItems = () => {
    if (!searchTerm.trim()) return items;
    const kw = searchTerm.toLowerCase();
    return items
      .map((it) => {
        const nameMatch = it.name.toLowerCase().includes(kw);
        const newSubs =
          it.subTasks?.filter((s) => s.name.toLowerCase().includes(kw)) ?? [];
        if (nameMatch || newSubs.length) return { ...it, subTasks: newSubs };
        return null;
      })
      .filter(Boolean);
  };
  const filteredItems = getFilteredItems();

  const allTasks = [];
  items.forEach((it) => {
    allTasks.push(it);
    it.subTasks?.forEach((s) => allTasks.push(s));
  });
  const completedCount = allTasks.filter((t) => t.status === "complete").length;
  const totalCount     = allTasks.length;
  const progressPercent = totalCount ? (completedCount / totalCount) * 100 : 0;
  const allComplete     = completedCount === totalCount && totalCount > 0;

  const renderNotes = () => {
    const { type, itemIndex, subIndex } = notesTarget;
    const obj = type === 'parent' ? items[itemIndex]
                                  : items[itemIndex].subTasks[subIndex];

    if (!obj.notes.length) {
      return <Typography variant="body2" color="text.secondary">Nu există note.</Typography>;
    }
    return obj.notes.map((n, idx) => (
      <Box key={idx} sx={{ p:1, mb:1, border:'1px solid #ddd', borderRadius:1 }}>
        <Box sx={{ display:'flex', alignItems:'center', mb:.5 }}>
          <Typography sx={{ fontWeight:700, flex:1 }}>
            {n.user} • {n.date}
          </Typography>

          {n.user === userName && (
            <>
              <IconButton size="small" onClick={() => startEditNote(idx)}>
                <EditIcon fontSize="inherit" />
              </IconButton>
              <IconButton size="small" color="error" onClick={() => deleteNote(idx)}>
                <DeleteIcon fontSize="inherit" />
              </IconButton>
            </>
          )}
        </Box>
        <Typography whiteSpace="pre-line">{n.text}</Typography>
      </Box>
    ));
  };

  // -----------------------------------------------------
  // 10) UI
  // -----------------------------------------------------
  if (!open) return null;

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        backgroundColor: "rgba(0,0,0,.6)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Card
        sx={{
          width: 1580,
          height: 766,
          zoom: .8,
          backgroundColor: "#fff",
          borderRadius: 3,
          p: 3,
          position: "relative",
        }}
      >
        {/* × */}
        <IconButton
          onClick={handleRequestClose}
          sx={{ position: "absolute", top: 8, right: 8 }}
        >
          <CloseIcon />
        </IconButton>

        {/* Titlu */}
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Typography variant="h5" sx={{ fontWeight: "bold", mr: 3 }}>
            {projectTitle}
          </Typography>
          <Typography variant="h5" color="primary" sx={{ fontWeight: "bold" }}>
            {categoryName}
          </Typography>
        </Box>


        {children && <Box sx={{ mt: 2 }}>{children}</Box>}

        {/* Add main task (editor) */}
        {isEditor && (
          <Box sx={{ display: "flex", gap: 1, mt: 2, mb: 2 }}>
            <TextField
              size="small"
              label="Nume Task Principal"
              value={newMainTask}
              onChange={(e) => setNewMainTask(e.target.value)}
            />
            <Button variant="contained" onClick={handleAddMainTask}>
              + Adaugă Task Principal
            </Button>
          </Box>
        )}

        {/* Search + progress */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
          <TextField
            size="small"
            label="Caută…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ width: 300 }}
          />
          <Box sx={{ flex: 1 }}>
            <LinearProgress
              variant="determinate"
              value={progressPercent}
              color="inherit"
              sx={{
                height: 8,
                borderRadius: 1,
                bgcolor: allComplete ? "#e0e0e0" : "#ffcdd2",
                "& .MuiLinearProgress-bar": {
                  backgroundColor: allComplete ? "seagreen" : "#d32f2f",
                  transition: "background-color 0.3s ease",
                },
              }}
            />
          </Box>
          <Typography sx={{ width: 140, textAlign: "center" }}>
            {completedCount}/{totalCount} ({Math.round(progressPercent)}%)
          </Typography>
        </Box>

        {/* LISTA */}
        <Box
          sx={{
            border: "1px solid #ddd",
            borderRadius: 2,
            p: 2,
            height: "calc(100% - 220px)",
            overflowY: "auto",
   // ==== SCROLLBAR STILIZAT PENTRU TASK-URI ====
   "&::-webkit-scrollbar": {
       width: "8px",
     },
     "&::-webkit-scrollbar-track": {
       backgroundColor: "#f2f2f2",
       borderRadius: 4,
     },
     "&::-webkit-scrollbar-thumb": {
       backgroundColor: "#b5b5b5",
       borderRadius: 4,
     },
    "&:hover::-webkit-scrollbar-thumb": {
      backgroundColor: "#8f8f8f",
    },
     /* Firefox */
     scrollbarWidth: "thin",
     scrollbarColor: "#b5b5b5rgb(110, 107, 107)",
          }}
        >
          <FormGroup>
            {filteredItems.map((item, i) => (
              <Box key={i} sx={{ border: "1px solid #ccc", p: 1, mb: 2 }}>
                {/* Parent */}
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  <Badge
                    badgeContent={item.subTasks?.length || 0}
                    color="primary"
                    invisible={!item.subTasks?.length}
                    sx={{ mr: 1 }}
                  >
                    <IconButton size="small" onClick={() => toggleExpand(i)}>
                      {isExpanded(i) ? <ArrowDropDownIcon /> : <ArrowRightIcon />}
                    </IconButton>
                  </Badge>

                  {editingTask &&
                  editingTask.type === "parent" &&
                  editingTask.itemIndex === i ? (
                    <>
                      <TextField
                        size="small"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        sx={{ flex: 1, mr: 1 }}
                      />
                      <Button variant="contained" onClick={saveEdit} sx={{ mr: 1 }}>
                        Salvare
                      </Button>
                      <Button onClick={cancelEdit}>Anulează</Button>
                    </>
                  ) : (
                    <FormControlLabel
                      sx={{ flex: 1 }}
                      label={item.name}
                      control={
                        <Box sx={{ display: "flex", gap: .5 }}>
                          {/* proposed */}
                          <LockedCheckbox
                            lock={isVerificator}
                            checked={getFlagState(item, "proposed").checked}
                            indeterminate={getFlagState(item, "proposed").indeterminate}
                            disabled={isVerificator}
                            onChange={(e) =>
                              toggleFlag(i, null, "proposed", e.target.checked)
                            }
                            sx={{ "&.Mui-checked": { color: "#1976d2" } }}
                          />
                          {/* verified */}
                          <LockedCheckbox
                            lock={isEditor}
                            checked={getFlagState(item, "verified").checked}
                            indeterminate={getFlagState(item, "verified").indeterminate}
                            disabled={isEditor || !item.proposed}
                            onChange={(e) =>
                              toggleFlag(i, null, "verified", e.target.checked)
                            }
                            sx={{ "&.Mui-checked": { color: "seagreen" } }}
                          />
                        </Box>
                      }
                    />
                  )}

                  {isEditor && (
                    <>
                      <ActionIcon
                        title="Editare"
                        onClick={() => startEdit("parent", i, null, item.name)}
                      >
                        <EditIcon fontSize="inherit" />
                      </ActionIcon>
                      <ActionIcon
                        title="Ștergere"
                        color="red"
                        onClick={() => handleDeleteTask(i)}
                      >
                        <DeleteIcon fontSize="inherit" />
                      </ActionIcon>
                    </>
                  )}
                  <ActionIcon
                    title="Note"
                    onClick={() => openNotes("parent", i, null)}
                  >
                    <Badge
                      overlap="circular"
                      badgeContent="!"
                      invisible={!hasNotes(item)}           // idem pentru `sub`
                      anchorOrigin={{ vertical:'top', horizontal:'right' }}
                      sx={{
                        "& .MuiBadge-badge": {
                          backgroundColor: "transparent",   // fără fundal
                          color: "#d32f2f",                 // roşu
                          fontWeight: 1000,
                          fontSize: 34,
                          boxShadow: "none",
                          p: 0,                             // fără padding – doar semnul
                        },
                      }}
                    >
                      <NoteIcon
                        fontSize="inherit"
                        sx={{ color: hasNotes(item) ? 'primary.main' : 'inherit' }}
                      />
                    </Badge>
                  </ActionIcon>
                </Box>

                {/* Subtasks */}
                {isExpanded(i) && (
                  <Box sx={{ ml: 8, mt: 1 }}>
                    {item.subTasks?.length ? (
                      <Box sx={{ mb: 2 }}>
                        {item.subTasks.map((sub, j) => (
                          <Box
                            key={j}
                            sx={{ display: "flex", alignItems: "center", mb: 1 }}
                          >
                            {editingTask &&
                            editingTask.type === "child" &&
                            editingTask.itemIndex === i &&
                            editingTask.subIndex === j ? (
                              <>
                                <TextField
                                  size="small"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  sx={{ flex: 1, mr: 1 }}
                                />
                                <Button
                                  variant="contained"
                                  onClick={saveEdit}
                                  sx={{ mr: 1 }}
                                >
                                  Salvare
                                </Button>
                                <Button onClick={cancelEdit}>Anulează</Button>
                              </>
                            ) : (
                              <FormControlLabel
                                sx={{ flex: 1 }}
                                label={sub.name}
                                control={
                                  <Box sx={{ display: "flex", gap: .5 }}>
                                    {/* proposed */}
                                    <LockedCheckbox
                                      lock={isVerificator}
                                      checked={sub.proposed}
                                      disabled={isVerificator}
                                      onChange={(e) =>
                                        toggleFlag(i, j, "proposed", e.target.checked)
                                      }
                                      sx={{ "&.Mui-checked": { color: "#1976d2" } }}
                                    />
                                    {/* verified */}
                                    <LockedCheckbox
                                      lock={isEditor}
                                      checked={sub.verified}
                                      disabled={isEditor || !sub.proposed}
                                      onChange={(e) =>
                                        toggleFlag(i, j, "verified", e.target.checked)
                                      }
                                      sx={{ "&.Mui-checked": { color: "seagreen" } }}
                                    />
                                  </Box>
                                }
                              />
                            )}

                            {isEditor && (
                              <>
                              <ActionIcon
                                title="Editare"
                                onClick={() => startEdit("child", i, j, sub.name)}
                              >
                                <EditIcon fontSize="inherit" />
                              </ActionIcon>

                              <ActionIcon
                                title="Ștergere"
                                color="red"
                                onClick={() => handleDeleteSubtask(i, j)}
                              >
                                <DeleteIcon fontSize="inherit" />
                              </ActionIcon>
                            </>
                            )}
                            <ActionIcon title="Note" onClick={() => openNotes("child", i, j)}>
                              <Badge
                                color="error"
                                overlap="circular"
                                badgeContent="!"
                                invisible={!hasNotes(sub)}
                                anchorOrigin={{ vertical: "top", horizontal: "right" }}
                              >
                                <NoteIcon
                                  fontSize="inherit"
                                  sx={{ color: hasNotes(sub) ? "primary.main" : "inherit" }}
                                />
                              </Badge>
                            </ActionIcon>
                          </Box>
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Nu există subtask‑uri.
                      </Typography>
                    )}

                    {/* add subtask */}
                    {isEditor && (
                      <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                        <TextField
                          size="small"
                          label="Nume subtask"
                          value={newSubtask}
                          onChange={(e) => setNewSubtask(e.target.value)}
                        />
                        <Button variant="contained" onClick={() => handleAddSubtask(i)}>
                          + Add Subtask
                        </Button>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            ))}
          </FormGroup>
        </Box>

        {/* FOOTER */}
        <Box sx={{ position: "absolute", bottom: 16, right: 16, display: "flex", gap: 2 }}>
          {allComplete && (
            <Button variant="contained" color="info" onClick={exportReport}>
              Generează Proces Verbal
            </Button>
          )}
          <Button variant="contained" color="success" onClick={handleSave}>
            OK
          </Button>
        </Box>
      </Card>

      {/* Dialog confirm close */}
      <Dialog
        open={showCloseConfirm}
        onClose={() => setShowCloseConfirm(false)}
        disablePortal
        sx={{ zIndex: 13001 }}
        slotProps={{
          paper: { sx: { zIndex: 13001 } },
          backdrop: { sx: { zIndex: 13000 } },
        }}
      >
        <DialogTitle>Modificări nesalvate</DialogTitle>
        <DialogContent>
          Sigur dorești să închizi fereastra? Vei pierde modificările nesalvate.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCloseConfirm(false)}>Anulează</Button>
          <Button color="error" onClick={confirmCloseWithoutSave}>
            Închide fără să salvezi
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog note */}
      <Dialog
        open={showNotesDialog}
        onClose={() => setShowNotesDialog(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper:    { sx: { zIndex: 13001, height: '70vh', display: 'flex', flexDirection: 'column' } },
          backdrop: { sx: { zIndex: 13000 } },
        }}
      >
        <DialogTitle>Note / comentarii</DialogTitle>

        <DialogContent
  sx={{
    flex: 1,                // ocupă restul hârtiei
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',     // ascunde overflow global
    pt: 1,
  }}
>
  {/*  LISTA NOTE – doar aici există scroll  */}
  <Box sx={{ flex: 1, overflowY: 'auto', pr: 1,
    '&::-webkit-scrollbar':        { width: '8px' },
    '&::-webkit-scrollbar-track':  { background: '#f2f2f2', borderRadius: 4 },
    '&::-webkit-scrollbar-thumb':  { background: '#b5b5b5', borderRadius: 4 },
    '&:hover::-webkit-scrollbar-thumb': { background: '#8f8f8f' },
  }}>
    {notesTarget && renderNotes()}       {/* funcţia ta de mai devreme */}
  </Box>

  {/*  INPUT NOTE – lipit jos, 0 scroll  */}
  <TextField
    multiline
    rows={4}
    fullWidth
    value={notesValue}
    onChange={(e) => setNotesValue(e.target.value)}
    label="Scrie notă…"
    sx={{ mt: 2 }}
  />
</DialogContent>

        <DialogActions>
          <Button onClick={() => setShowNotesDialog(false)}>Închide</Button>
          <Button variant="contained" onClick={saveNotes}>
            {editingNote !== null ? 'Salvează' : 'Adaugă'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
