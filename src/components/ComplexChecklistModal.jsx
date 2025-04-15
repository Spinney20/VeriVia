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

import Badge from "@mui/material/Badge"; // <--- IMPORTĂM Badge
import CloseIcon from "@mui/icons-material/Close";
import ArrowRightIcon from "@mui/icons-material/ArrowRight";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import NoteIcon from "@mui/icons-material/NoteAdd";

import { invoke } from "@tauri-apps/api/tauri";

export default function ComplexChecklistModal({
  open,
  onClose,
  onConfirm,
  projectTitle = "Titlu Proiect",
  userName = "NumeUtilizator",
  categoryName = "Eligibilitate", // implicit categoria din DB
  initialTasks = [],              // PROP nou: set de taskuri preluate (ex. din Excel)
  children,                     // banner / conținut suplimentar
}) {
  // -----------------------------------------------------
  // HOOKS & STATE
  // -----------------------------------------------------
  const [dbData, setDbData] = useState(null);
  const [items, setItems] = useState([]);
  const [expanded, setExpanded] = useState([]);
  const [newMainTask, setNewMainTask] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [auditLog, setAuditLog] = useState([]);

  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Editare Task
  const [editingTask, setEditingTask] = useState(null); // { type, itemIndex, subIndex, originalName }
  const [editName, setEditName] = useState("");

  // Note / Comentarii
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [notesValue, setNotesValue] = useState("");
  const [notesTarget, setNotesTarget] = useState(null); // { type, itemIndex, subIndex }

  // Subtask nou
  const [newSubtask, setNewSubtask] = useState("");

  // -----------------------------------------------------
  // 0) HELPER: getParentCheckboxState
  // -----------------------------------------------------
  const getParentCheckboxState = (item) => {
    const hasSub = item.subTasks && item.subTasks.length > 0;
    if (!hasSub) {
      return {
        checked: item.status === "complete",
        indeterminate: false,
      };
    }
    const allChecked = item.subTasks.every((st) => st.status === "complete");
    const someChecked = item.subTasks.some((st) => st.status === "complete");
    return {
      checked: allChecked,
      indeterminate: someChecked && !allChecked,
    };
  };

  // -----------------------------------------------------
  // 1) Când se deschide modalul => încărcăm datele
  // -----------------------------------------------------
  useEffect(() => {
    async function fetchData() {
      try {
        // Încărcăm DB-ul complet, pentru a putea face salvări ulterioare.
        const data = await invoke("load_projects");
        setDbData(data);

        const foundProject = data.projects?.find(
          (p) => p.title === projectTitle
        );
        if (!foundProject) return;

        // Căutăm categoria după categoryName
        const foundCategory = foundProject.categories?.find(
          (cat) => cat.name === categoryName
        );
        if (!foundCategory) return;

        // Dacă prop-ul initialTasks a fost transmis și nu este gol, se folosește el,
        // altfel se folosește checklist-ul din DB.
        setItems(
          initialTasks && initialTasks.length > 0
            ? initialTasks
            : foundCategory.checklist || []
        );
        setAuditLog([]); // Resetăm log la deschidere
      } catch (error) {
        console.error("Eroare la încărcarea proiectelor:", error);
      }
    }

    if (open) {
      fetchData();
      window.addEventListener("beforeunload", handleBeforeUnload);
    }
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [open, projectTitle, categoryName, initialTasks]);

  // -----------------------------------------------------
  // 2) Interceptare închidere (pentru confirmare)
  // -----------------------------------------------------
  const handleBeforeUnload = (e) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = "Ai modificări nesalvate. Sigur vrei să închizi?";
    }
  };

  const handleRequestClose = () => {
    if (hasUnsavedChanges) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  };

  const confirmCloseWithoutSave = () => {
    setShowCloseConfirm(false);
    onClose();
  };

  // -----------------------------------------------------
  // 3) Expand / Collapse
  // -----------------------------------------------------
  const isExpanded = (index) => expanded.includes(index);

  const toggleExpand = (index) => {
    setExpanded((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  // -----------------------------------------------------
  // 4) Toggle părinte / subtask
  // -----------------------------------------------------
  const handleToggleParent = (itemIndex, checked) => {
    setHasUnsavedChanges(true);
    setItems((prevItems) => {
      const newItems = [...prevItems];
      const task = { ...newItems[itemIndex] };

      const actionText = checked ? "Checked parent" : "Unchecked parent";
      addAuditLog(itemIndex, null, actionText);

      if (task.subTasks && task.subTasks.length > 0) {
        task.subTasks = task.subTasks.map((sub) => ({
          ...sub,
          status: checked ? "complete" : "incomplete",
        }));
      }
      task.status = checked ? "complete" : "incomplete";
      newItems[itemIndex] = task;
      return newItems;
    });
  };

  const handleToggleChild = (itemIndex, subIndex, checked) => {
    setHasUnsavedChanges(true);
    setItems((prevItems) => {
      const newItems = [...prevItems];
      const task = { ...newItems[itemIndex] };

      if (task.subTasks && task.subTasks[subIndex]) {
        const updatedSub = { ...task.subTasks[subIndex] };
        updatedSub.status = checked ? "complete" : "incomplete";
        task.subTasks[subIndex] = updatedSub;

        const actionText = checked ? "Checked subtask" : "Unchecked subtask";
        addAuditLog(itemIndex, subIndex, actionText);

        const allChecked = task.subTasks.every((st) => st.status === "complete");
        task.status = allChecked ? "complete" : "incomplete";
      }
      newItems[itemIndex] = task;
      return newItems;
    });
  };

  // -----------------------------------------------------
  // 5) Add / Delete / Edit
  // -----------------------------------------------------
  const handleAddMainTask = () => {
    if (!newMainTask.trim()) return;
    setHasUnsavedChanges(true);

    const newItem = {
      name: newMainTask,
      status: "incomplete",
      subTasks: [],
    };
    setItems((prev) => [...prev, newItem]);
    setNewMainTask("");
    addAuditLog(null, null, `Adăugat main task: ${newMainTask}`);
  };

  const handleAddSubtask = (itemIndex) => {
    if (!newSubtask.trim()) return;
    setHasUnsavedChanges(true);

    setItems((prevItems) => {
      const newItems = [...prevItems];
      const task = { ...newItems[itemIndex] };

      if (!task.subTasks) {
        task.subTasks = [];
      }
      task.subTasks.push({
        name: newSubtask,
        status: "incomplete",
        subTasks: [],
      });
      newItems[itemIndex] = task;
      return newItems;
    });
    addAuditLog(itemIndex, null, `Adăugat subtask: ${newSubtask}`);
    setNewSubtask("");
  };

  const handleDeleteTask = (itemIndex) => {
    setHasUnsavedChanges(true);
    const deletedName = items[itemIndex].name;

    setItems((prev) => {
      const newArr = [...prev];
      newArr.splice(itemIndex, 1);
      return newArr;
    });
    addAuditLog(itemIndex, null, `Șters main task: ${deletedName}`);
  };

  const handleDeleteSubtask = (itemIndex, subIndex) => {
    setHasUnsavedChanges(true);
    const deletedName = items[itemIndex].subTasks[subIndex].name;

    setItems((prev) => {
      const newItems = [...prev];
      newItems[itemIndex].subTasks.splice(subIndex, 1);
      return newItems;
    });
    addAuditLog(itemIndex, subIndex, `Șters subtask: ${deletedName}`);
  };

  // Editare task/subtask
  const startEdit = (type, itemIndex, subIndex, originalName) => {
    setEditingTask({ type, itemIndex, subIndex, originalName });
    setEditName(originalName);
  };

  const saveEdit = () => {
    if (!editName.trim()) {
      setEditingTask(null);
      return;
    }
    setHasUnsavedChanges(true);

    const { type, itemIndex, subIndex, originalName } = editingTask;
    if (type === "parent") {
      setItems((prev) => {
        const newArr = [...prev];
        newArr[itemIndex].name = editName;
        return newArr;
      });
      addAuditLog(
        itemIndex,
        null,
        `Renamed parent "${originalName}" to "${editName}"`
      );
    } else if (type === "child") {
      setItems((prev) => {
        const newArr = [...prev];
        newArr[itemIndex].subTasks[subIndex].name = editName;
        return newArr;
      });
      addAuditLog(
        itemIndex,
        subIndex,
        `Renamed subtask "${originalName}" to "${editName}"`
      );
    }
    setEditingTask(null);
  };

  const cancelEdit = () => {
    setEditingTask(null);
  };

  // -----------------------------------------------------
  // 6) Note / Comentarii
  // -----------------------------------------------------
  const openNotes = (type, itemIndex, subIndex) => {
    setNotesTarget({ type, itemIndex, subIndex });
    setNotesValue("");
    setShowNotesDialog(true);
  };

  const saveNotes = () => {
    if (!notesTarget) return;
    setHasUnsavedChanges(true);

    const { type, itemIndex, subIndex } = notesTarget;

    setItems((prev) => {
      const newItems = [...prev];
      if (type === "parent") {
        if (!("notes" in newItems[itemIndex])) {
          newItems[itemIndex].notes = [];
        }
        newItems[itemIndex].notes.push({
          date: new Date().toLocaleString(),
          user: userName,
          text: notesValue,
        });
      } else {
        if (!("notes" in newItems[itemIndex].subTasks[subIndex])) {
          newItems[itemIndex].subTasks[subIndex].notes = [];
        }
        newItems[itemIndex].subTasks[subIndex].notes.push({
          date: new Date().toLocaleString(),
          user: userName,
          text: notesValue,
        });
      }
      return newItems;
    });
    addAuditLog(itemIndex, subIndex, `Adăugat notă: "${notesValue}"`);
    setShowNotesDialog(false);
  };

  // -----------------------------------------------------
  // 7) Audit log
  // -----------------------------------------------------
  const addAuditLog = (itemIndex, subIndex, action) => {
    const now = new Date().toLocaleString();
    const entry = {
      time: now,
      user: userName,
      itemIndex,
      subIndex,
      action,
    };
    setAuditLog((prev) => [...prev, entry]);
  };

  // -----------------------------------------------------
  // 8) Salvare finală
  // -----------------------------------------------------
  const handleSave = async () => {
    if (!dbData) {
      console.error("Nu s-au încărcat datele din DB încă.");
      return;
    }
    const updatedDb = { ...dbData };

    const projectIndex = updatedDb.projects?.findIndex(
      (p) => p.title === projectTitle
    );
    if (projectIndex === -1) {
      console.error("Proiectul nu a fost găsit.");
      return;
    }

    // Updatăm checklist-ul la categoria specificată (ex: "Tehnic" sau altceva)
    const categoryIndex =
      updatedDb.projects[projectIndex].categories?.findIndex(
        (c) => c.name === categoryName
      );
    if (categoryIndex === -1) {
      console.error(`Categoria '${categoryName}' nu a fost găsită.`);
      return;
    }

    updatedDb.projects[projectIndex].categories[categoryIndex].checklist =
      items;

    try {
      await invoke("save_projects", {
        newData: JSON.stringify(updatedDb, null, 2),
      });
      console.log("Date salvate cu succes în JSON.");
      setHasUnsavedChanges(false);
      if (onConfirm) {
        onConfirm();
      }
      onClose();
    } catch (error) {
      console.error("Eroare la salvarea proiectelor:", error);
    }
  };

  // -----------------------------------------------------
  // 9) Filtrare / Căutare
  // -----------------------------------------------------
  const getFilteredItems = () => {
    if (!searchTerm.trim()) {
      return items;
    }
    const lowerSearch = searchTerm.toLowerCase();

    return items
      .map((item) => {
        const nameMatch = item.name.toLowerCase().includes(lowerSearch);

        let newSubTasks = [];
        if (item.subTasks && item.subTasks.length > 0) {
          newSubTasks = item.subTasks.filter((sub) =>
            sub.name.toLowerCase().includes(lowerSearch)
          );
        }

        if (nameMatch || newSubTasks.length > 0) {
          return {
            ...item,
            subTasks: newSubTasks,
          };
        }
        return null;
      })
      .filter(Boolean);
  };

  // -----------------------------------------------------
  // 10) Calcul bară de progres (x din y complete)
  // -----------------------------------------------------
  const allTasks = [];
  items.forEach((item) => {
    allTasks.push(item);
    if (item.subTasks) {
      item.subTasks.forEach((st) => allTasks.push(st));
    }
  });

  const completedCount = allTasks.filter((t) => t.status === "complete").length;
  const totalCount = allTasks.length;
  const progressPercent =
    totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // -----------------------------------------------------
  // 11) Generare PDF (doar când totul e complet)
  // -----------------------------------------------------
  const allComplete = completedCount === totalCount && totalCount > 0;

  const generatePdf = () => {
    alert(
      "Generez PDF... (placeholder) \nAudit log:\n" +
        JSON.stringify(auditLog, null, 2)
    );
  };

  // -----------------------------------------------------
  // UI
  // -----------------------------------------------------
  if (!open) return null;
  const filteredItems = getFilteredItems();

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "auto",
      }}
    >
      <Card
        sx={{
          width: "1580px",
          height: "766px",
          transform: "scale(0.8)",
          transformOrigin: "center",
          backgroundColor: "rgba(255, 255, 255, 0.9)",
          borderRadius: 3,
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
          p: 3,
          position: "relative",
          pointerEvents: "auto",
        }}
      >
        {/* Buton de închidere */}
        <IconButton
          onClick={handleRequestClose}
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            color: "#333",
          }}
        >
          <CloseIcon />
        </IconButton>

        {/* Checkbox global => denumirea categoriei afișată */}
        <Box sx={{ position: "absolute", top: 12, right: 60 }}>
          <FormControlLabel
            control={<Checkbox checked={allComplete} disabled />}
            label={categoryName}
          />
        </Box>

        {/* Titlu principal */}
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Typography variant="h5" sx={{ fontWeight: "bold", mr: 3 }}>
            {projectTitle}
          </Typography>
          <Typography variant="h5" color="primary" sx={{ fontWeight: "bold" }}>
            {categoryName}
          </Typography>
        </Box>

        {/* Afișare banner (children) dacă există */}
        {children && <Box sx={{ mt: 2 }}>{children}</Box>}

        {/* Adăugare Task Principal */}
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

        {/* Search + Bara de progres */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
          <TextField
            size="small"
            label="Caută..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ width: 300 }}
          />
          <Box sx={{ flex: 1 }}>
            <LinearProgress
              variant="determinate"
              value={progressPercent}
              sx={{
                height: 8,
                borderRadius: 1,
                backgroundColor: allComplete ? "#e0e0e0" : "#ffe5e5",
                "& .MuiLinearProgress-bar": {
                  backgroundColor: allComplete ? "#2e7d32" : "#d32f2f",
                  transition: "background-color 0.3s ease",
                },
              }}
            />
          </Box>
          <Typography variant="body1" sx={{ width: 140, textAlign: "center" }}>
            {completedCount}/{totalCount} ({Math.round(progressPercent)}%)
          </Typography>
        </Box>

        {/* Container scroll */}
        <Box
          sx={{
            border: "1px solid #ddd",
            borderRadius: 2,
            padding: 2,
            height: "calc(100% - 220px)",
            overflowY: "auto",
          }}
        >
          <FormGroup>
            {filteredItems.map((item, itemIndex) => {
              const { checked, indeterminate } = getParentCheckboxState(item);

              return (
                <Box
                  key={itemIndex}
                  sx={{
                    border: "1px solid #ccc",
                    borderRadius: 2,
                    p: 1,
                    mb: 2,
                  }}
                >
                  {/* PARENT ROW */}
                  <Box sx={{ display: "flex", alignItems: "center" }}>
                    {/* Afișăm iconul expand/collapse ÎNTOTDEAUNA
                        + folosim Badge să afișăm nr. subtask-uri (dacă există) */}
                    <Badge
                      badgeContent={item.subTasks?.length || 0}
                      color="primary"
                      invisible={!item.subTasks || item.subTasks.length === 0}
                      sx={{ mr: 1 }}
                    >
                      <IconButton
                        size="small"
                        onClick={() => toggleExpand(itemIndex)}
                      >
                        {isExpanded(itemIndex) ? (
                          <ArrowDropDownIcon />
                        ) : (
                          <ArrowRightIcon />
                        )}
                      </IconButton>
                    </Badge>

                    {editingTask &&
                    editingTask.type === "parent" &&
                    editingTask.itemIndex === itemIndex ? (
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
                        <Button variant="text" onClick={cancelEdit}>
                          Anulare
                        </Button>
                      </>
                    ) : (
                      <FormControlLabel
                        sx={{ flex: 1 }}
                        label={item.name}
                        control={
                          <Checkbox
                            checked={checked}
                            indeterminate={indeterminate}
                            onChange={(e) =>
                              handleToggleParent(itemIndex, e.target.checked)
                            }
                            sx={{
                              "&.MuiCheckbox-indeterminate": {
                                color: "#d32f2f",
                              },
                            }}
                          />
                        }
                      />
                    )}

                    <IconButton
                      onClick={() =>
                        startEdit("parent", itemIndex, null, item.name)
                      }
                      size="small"
                    >
                      <EditIcon fontSize="inherit" />
                    </IconButton>
                    <IconButton
                      onClick={() => openNotes("parent", itemIndex, null)}
                      size="small"
                    >
                      <NoteIcon fontSize="inherit" />
                    </IconButton>
                    <IconButton
                      onClick={() => handleDeleteTask(itemIndex)}
                      size="small"
                    >
                      <DeleteIcon fontSize="inherit" />
                    </IconButton>
                  </Box>

                  {/* SUBTASKS (dacă expand) */}
                  {isExpanded(itemIndex) && (
                    <Box sx={{ ml: 8, mt: 1 }}>
                      {!item.subTasks || item.subTasks.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          Nu există subtask-uri. Adaugă mai jos:
                        </Typography>
                      ) : (
                        <Box sx={{ mb: 2 }}>
                          {item.subTasks.map((sub, subIndex) => {
                            const isEditing =
                              editingTask &&
                              editingTask.type === "child" &&
                              editingTask.itemIndex === itemIndex &&
                              editingTask.subIndex === subIndex;

                            return (
                              <Box
                                key={subIndex}
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  mb: 1,
                                }}
                              >
                                {isEditing ? (
                                  <>
                                    <TextField
                                      size="small"
                                      value={editName}
                                      onChange={(e) =>
                                        setEditName(e.target.value)
                                      }
                                      sx={{ flex: 1, mr: 1 }}
                                    />
                                    <Button
                                      variant="contained"
                                      onClick={saveEdit}
                                      sx={{ mr: 1 }}
                                    >
                                      Salvare
                                    </Button>
                                    <Button variant="text" onClick={cancelEdit}>
                                      Anulare
                                    </Button>
                                  </>
                                ) : (
                                  <FormControlLabel
                                    sx={{ flex: 1 }}
                                    label={sub.name}
                                    control={
                                      <Checkbox
                                        checked={sub.status === "complete"}
                                        onChange={(e) =>
                                          handleToggleChild(
                                            itemIndex,
                                            subIndex,
                                            e.target.checked
                                          )
                                        }
                                      />
                                    }
                                  />
                                )}

                                <IconButton
                                  onClick={() =>
                                    startEdit(
                                      "child",
                                      itemIndex,
                                      subIndex,
                                      sub.name
                                    )
                                  }
                                  size="small"
                                >
                                  <EditIcon fontSize="inherit" />
                                </IconButton>
                                <IconButton
                                  onClick={() =>
                                    openNotes("child", itemIndex, subIndex)
                                  }
                                  size="small"
                                >
                                  <NoteIcon fontSize="inherit" />
                                </IconButton>
                                <IconButton
                                  onClick={() =>
                                    handleDeleteSubtask(itemIndex, subIndex)
                                  }
                                  size="small"
                                >
                                  <DeleteIcon fontSize="inherit" />
                                </IconButton>
                              </Box>
                            );
                          })}
                        </Box>
                      )}

                      {/* +Add Subtask */}
                      <Box
                        sx={{
                          display: "flex",
                          gap: 1,
                          alignItems: "center",
                          mt: 1,
                        }}
                      >
                        <TextField
                          size="small"
                          label="Nume subtask"
                          value={newSubtask}
                          onChange={(e) => setNewSubtask(e.target.value)}
                        />
                        <Button
                          variant="contained"
                          onClick={() => handleAddSubtask(itemIndex)}
                        >
                          + Add Subtask
                        </Button>
                      </Box>
                    </Box>
                  )}
                </Box>
              );
            })}
          </FormGroup>
        </Box>

        {/* Buton generare PDF / OK => salvare */}
        <Box
          sx={{
            position: "absolute",
            bottom: 16,
            right: 16,
            display: "flex",
            gap: 2,
          }}
        >
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

      {/* Dialog confirmare închidere */}
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
          <Button onClick={() => setShowCloseConfirm(false)}>
            Anulează
          </Button>
          <Button onClick={confirmCloseWithoutSave} color="error">
            Închide fără să salvezi
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog pentru note / comentarii */}
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
          <Button onClick={() => setShowNotesDialog(false)}>
            Anulează
          </Button>
          <Button variant="contained" onClick={saveNotes}>
            Salvează
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
