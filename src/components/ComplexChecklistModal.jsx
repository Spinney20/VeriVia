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

import { invoke } from "@tauri-apps/api/tauri";

export default function ComplexChecklistModal({
  open,
  onClose,
  onConfirm,
  /* ───────── nou: rolul utilizatorului ───────── */
  mode = "editor", // "editor" | "verificator"
  /* ───────────────────────────────────────────── */
  projectTitle = "Titlu Proiect",
  userName     = "NumeUtilizator",
  categoryName = "Eligibilitate",
  initialTasks = [],
  children,
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

  // -----------------------------------------------------
  //  Roluri
  // -----------------------------------------------------
  const isEditor      = mode === "editor";
  const isVerificator = mode === "verificator";

  const Lock = () => (
    <LockIcon sx={{
      fontSize: 18,
      opacity: 0.5,
      pointerEvents: "none",

      // poziţionare relativă
      position: "relative",
      left: "-29.5px", // mută 8px la stânga
      top: "5px"    // mută 4px în jos
    }}/>
  );

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

  const getFlagState = (item, flag) => {
    if (!item.subTasks || item.subTasks.length === 0)
      return { checked: item[flag], indeterminate: false };
    const all  = item.subTasks.every((st) => st[flag]);
    const some = item.subTasks.some((st) => st[flag]);
    return { checked: all, indeterminate: some && !all };
  };

  // -----------------------------------------------------
  // 1) Load data
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

        const raw = category.checklist?.length ? category.checklist : initialTasks;

        const addFlags = (t) => ({
          ...t,
          proposed : typeof t.proposed  === "boolean" ? t.proposed  : false,
          verified : typeof t.verified  === "boolean" ? t.verified  : false,
          subTasks : (t.subTasks ?? []).map(addFlags),
        });
        const fixStatus = (t) => {
          t.status = t.proposed && t.verified ? "complete" : "incomplete";
          t.subTasks.forEach(fixStatus);
        };

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
  // 2) Interceptare închidere
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
  // 3) Expand / Collapse
  // -----------------------------------------------------
  const isExpanded = (i) => expanded.includes(i);
  const toggleExpand = (i) =>
    setExpanded((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));

  // -----------------------------------------------------
  // 4) Toggle flag (rol‑aware)
  // -----------------------------------------------------
  const toggleFlag = (pIdx, sIdx, flag, val) => {
    if (isVerificator && flag === "proposed") return; // verificator nu modifică proposed
    if (isEditor      && flag === "verified") return; // editor nu modifică verified

    // verificator nu poate bifa verified dacă proposed e false
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

  // -----------------------------------------------------
  // 5) Toggle status (bifat complet/incomplet)
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
  // 6) Add / Edit / Delete – doar editorul
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
  // 7) Note & audit
  // -----------------------------------------------------
  const openNotes = (type, i, j) => {
    setNotesTarget({ type, itemIndex: i, subIndex: j });
    setNotesValue("");
    setShowNotesDialog(true);
  };
  const saveNotes = () => {
    if (!notesTarget) return;
    setHasUnsavedChanges(true);
    const { type, itemIndex, subIndex } = notesTarget;
    setItems((prev) => {
      const n = structuredClone(prev);
      const push = (obj) => {
        if (!obj.notes) obj.notes = [];
        obj.notes.push({
          date: new Date().toLocaleString(),
          user: userName,
          text: notesValue,
        });
      };
      type === "parent"
        ? push(n[itemIndex])
        : push(n[itemIndex].subTasks[subIndex]);
      return n;
    });
    setShowNotesDialog(false);
  };

  const addAuditLog = (itemIndex, subIndex, action) =>
    setAuditLog((p) => [
      ...p,
      { time: new Date().toLocaleString(), user: userName, itemIndex, subIndex, action },
    ]);

  // -----------------------------------------------------
  // 8) Salvare finală – parametru corect: new_data
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

    updated.projects[pIdx].categories[cIdx].checklist = items;

    try {
      await invoke("save_projects", {
        /*  trimitem **ambele** așa încât să meargă în oricare
            dintre variantele de parametru din Rust                */
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
  // 9) Filtrare & progres
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

  const generatePdf = () =>
    alert("Generez PDF…\n" + JSON.stringify(auditLog, null, 2));

  // -----------------------------------------------------
  // 10) UI
  // -----------------------------------------------------
  if (!open) return null;

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
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
          transform: "scale(.8)",
          backgroundColor: "rgba(255,255,255,.9)",
          borderRadius: 3,
          p: 3,
          position: "relative",
        }}
      >
        {/* × */}
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

        {/* Add task principal */}
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
            color="inherit"                                          // ← forțează să nu mai folosească albastrul implicit
            sx={{
              height: 8,
              borderRadius: 1,
              bgcolor: allComplete ? "#e0e0e0" : "#ffcdd2",          // track: gri la final, roșu pal înainte
              "& .MuiLinearProgress-bar": {
                backgroundColor: allComplete ? "seagreen" : "#d32f2f", // bară: verde la 100%, roșie altfel
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
                      {isExpanded(i) ? <ArrowDropDownIcon/> : <ArrowRightIcon/>}
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
                          <Box sx={{ position: "relative" }}>
                            <Checkbox
                              checked={getFlagState(item, "proposed").checked}
                              indeterminate={getFlagState(item, "proposed").indeterminate}
                              disabled={isVerificator}
                              onChange={(e) =>
                                toggleFlag(i, null, "proposed", e.target.checked)
                              }
                              sx={{ "&.Mui-checked": { color: "#1976d2" } }}
                            />
                            {isVerificator && <Lock />}
                          </Box>
                          {/* verified */}
                          <Box sx={{ position: "relative" }}>
                            <Checkbox
                              checked={getFlagState(item, "verified").checked}
                              indeterminate={getFlagState(item, "verified").indeterminate}
                              disabled={
                                isEditor ||
                                item.subTasks.some((st) => !st.proposed)
                              }
                              onChange={(e) =>
                                toggleFlag(i, null, "verified", e.target.checked)
                              }
                              sx={{ "&.Mui-checked": { color: "seagreen" } }}
                            />
                            {(isEditor ||
                              item.subTasks.some((st) => !st.proposed)) && <Lock />}
                          </Box>
                        </Box>
                      }
                    />
                  )}

                  {isEditor && (
                    <>
                      <IconButton
                        onClick={() => startEdit("parent", i, null, item.name)}
                        size="small"
                      >
                        <EditIcon fontSize="inherit" />
                      </IconButton>
                      <IconButton onClick={() => handleDeleteTask(i)} size="small">
                        <DeleteIcon fontSize="inherit" />
                      </IconButton>
                    </>
                  )}
                  <IconButton onClick={() => openNotes("parent", i, null)} size="small">
                    <NoteIcon fontSize="inherit" />
                  </IconButton>
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
                                    <Box sx={{ position: "relative" }}>
                                      <Checkbox
                                        checked={sub.proposed}
                                        disabled={isVerificator}
                                        onChange={(e) =>
                                          toggleFlag(i, j, "proposed", e.target.checked)
                                        }
                                        sx={{ "&.Mui-checked": { color: "#1976d2" } }}
                                      />
                                      {isVerificator && <Lock />}
                                    </Box>
                                    {/* verified */}
                                    <Box sx={{ position: "relative" }}>
                                      <Checkbox
                                        checked={sub.verified}
                                        disabled={isEditor || !sub.proposed}
                                        onChange={(e) =>
                                          toggleFlag(i, j, "verified", e.target.checked)
                                        }
                                        sx={{ "&.Mui-checked": { color: "seagreen" } }}
                                      />
                                      {(isEditor || !sub.proposed) && <Lock />}
                                    </Box>
                                  </Box>
                                }
                              />
                            )}

                            {isEditor && (
                              <>
                                <IconButton
                                  onClick={() => startEdit("child", i, j, sub.name)}
                                  size="small"
                                >
                                  <EditIcon fontSize="inherit" />
                                </IconButton>
                                <IconButton
                                  onClick={() => handleDeleteSubtask(i, j)}
                                  size="small"
                                >
                                  <DeleteIcon fontSize="inherit" />
                                </IconButton>
                              </>
                            )}
                            <IconButton
                              onClick={() => openNotes("child", i, j)}
                              size="small"
                            >
                              <NoteIcon fontSize="inherit" />
                            </IconButton>
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
            <Button variant="contained" color="info" onClick={generatePdf}>
              Generează Proces Verbal
            </Button>
          )}
          <Button variant="contained" color="success" onClick={handleSave}>
            OK
          </Button>
        </Box>
      </Card>

      {/* Dialog confirm close */}
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
        disablePortal
        sx={{ zIndex: 13001 }}
        slotProps={{
          paper: { sx: { zIndex: 13001 } },
          backdrop: { sx: { zIndex: 13000 } },
        }}
      >
        <DialogTitle>Adaugă note / comentarii</DialogTitle>
        <DialogContent>
          <TextField
            multiline
            rows={4}
            fullWidth
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            label="Note"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowNotesDialog(false)}>Anulează</Button>
          <Button variant="contained" onClick={saveNotes}>
            Salvează
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
