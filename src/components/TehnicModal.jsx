import React, { useState, useEffect } from "react";
import ComplexChecklistModal from "./ComplexChecklistModal";
import { invoke } from "@tauri-apps/api/tauri";
import { open as openDialog } from "@tauri-apps/api/dialog";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import CloseIcon from "@mui/icons-material/Close";
import excelIcon from "../images/excel.png";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";

export default function TehnicModal({
  mode = "editor",
  initialTasks: propTasks,
  projectId,
  excelPath: initialPath,
  open,
  onClose,
  onConfirm,
  onExcelPathSaved,
  ...props
}) {
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [excelData, setExcelData] = useState(null);
  const [excelPath, setExcelPath] = useState(initialPath);
  const [showExcelBanner, setShowExcelBanner] = useState(!!initialPath);
  const [iconHovered, setIconHovered] = useState(false);

  const isEditor = mode === "editor";

  // sincronizează excelPath local cu prop
  useEffect(() => {
    if (initialPath !== excelPath) {
      setExcelPath(initialPath);
      if (initialPath) {
        // Reîncarcă datele Excel dacă initialPath s-a schimbat
        loadExcel(initialPath, true); // silent=true pentru a nu afișa alert
      }
    }
  }, [initialPath]);

    useEffect(() => {
        if (!open) return;
        (async () => {
          try {
            const data = await invoke("load_projects");
            const proj = data.projects.find(p => p.id === projectId);
            const cat  = proj.categories.find(c => c.name.toLowerCase() === "tehnic");
            const dbPath = cat?.excelPath || null;
            setExcelPath(dbPath);
            setShowExcelBanner(!!dbPath);
          } catch (err) {
            console.error("Eroare la fetch proiect:", err);
          }
        })();
      }, [open, projectId]);


  /* încărcare nouă */
  const handleAddExcel = async () => {
    const filePath = await openDialog({
      filters: [{ name: "Excel Files", extensions: ["xlsx", "xls"] }],
      multiple: false,
    });
    if (filePath) {
      await loadExcel(filePath);
    }
  };

  const handleUpdateExcel = async () => {
    if (excelPath) {
      await loadExcel(excelPath);
    }
  };

  /* loader comun */
  const loadExcel = async (filePath, silent = false) => {
    setLoadingExcel(true);
    try {
      const data = await invoke("load_technical_data", { filePath });
      setExcelData(data);
      setExcelPath(filePath);

      await invoke("save_excel_path", { project_id: projectId, path: filePath });
      onExcelPathSaved?.(filePath);

      if (!silent) {
        // ascund banner după load
        setShowExcelBanner(false);
      }
      if (!silent) alert("Excel loaded successfully!");
    } catch (err) {
      console.error("Error loading Excel data:", err);
      alert("Eroare la încărcarea Excel.");
    }
    setLoadingExcel(false);
  };

  const initialTasks = excelData ?? propTasks;

  return (
    <ComplexChecklistModal
      {...props}
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      mode={mode}
      categoryName="Tehnic"
      initialTasks={initialTasks}
      excelPath={excelPath}
    >
      {isEditor && (
        <>
          {showExcelBanner ? (
            <Box sx={{ position: "relative", mb: 2 }}>
              <IconButton
                size="small"
                onClick={() => setShowExcelBanner(false)}
                sx={{ position: "absolute", top: 4, right: 4, color: "#555" }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>

              <Box
                sx={{
                  p: 1,
                  backgroundColor: "#e2e3e5",
                  border: "1px solid #d6d8db",
                  borderRadius: 1,
                  textAlign: "center",
                }}
              >
                <Typography variant="body1" sx={{ fontWeight: "bold", color: "#383d41" }}>
                  ATENȚIE: Categoriile și subcategoriile tehnice vor fi preluate automat din Excel.
                </Typography>
              </Box>

              <Box
                sx={{
                  mt: 1,
                  display: "flex",
                  gap: 1,
                  justifyContent: "center",
                }}
              >
                <Button
                  variant="contained"
                  onClick={handleAddExcel}
                  disabled={loadingExcel}
                  startIcon={<img src={excelIcon} alt="Excel" style={{ width: 30 }} />}
                >
                  {loadingExcel ? "Loading…" : "Adaugă Excel"}
                </Button>

                <Tooltip
                  title={excelPath ? "Reîncarcă fișierul existent" : "Nu există încă un Excel"}
                  arrow
                >
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      color="secondary"
                      disabled={!excelPath || loadingExcel}
                      onClick={handleUpdateExcel}
                    >
                      Update
                    </Button>
                  </span>
                </Tooltip>
              </Box>
            </Box>
          ) : (
            <Box sx={{ mb: 2, textAlign: "center" }}>
              <Button
                variant="outlined"
                onMouseEnter={() => setIconHovered(true)}
                onMouseLeave={() => setIconHovered(false)}
                onClick={() => setShowExcelBanner(true)}
                startIcon={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <img src={excelIcon} alt="Excel" style={{ width: 20 }} />
                    {iconHovered ? <VisibilityIcon /> : <VisibilityOffIcon />}
                  </Box>
                }
              >
                Afișează opțiune încărcare Excel
              </Button>
            </Box>
          )}
        </>
      )}
    </ComplexChecklistModal>
  );
}
