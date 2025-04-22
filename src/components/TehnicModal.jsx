// src/components/TehnicModal.jsx
import React, { useState } from "react";
import ComplexChecklistModal from "./ComplexChecklistModal";
import { invoke } from "@tauri-apps/api/tauri";
import { open } from "@tauri-apps/api/dialog";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import excelIcon from "../images/excel.png";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";

export default function TehnicModal({
  mode = "editor",          // rolul utilizatorului
  initialTasks: propTasks,  // datele inițiale venite din props
  ...props
}) {
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [excelData, setExcelData]       = useState(null);
  const [showExcelBanner, setShowExcelBanner] = useState(false);
  const [iconHovered, setIconHovered]         = useState(false);

  const isEditor = mode === "editor";

  const handleAddExcel = async () => {
    setLoadingExcel(true);
    try {
      const filePath = await open({
        filters: [{ name: "Excel Files", extensions: ["xlsx", "xls"] }],
        multiple: false,
      });
      if (!filePath) {
        setLoadingExcel(false);
        return;
      }
      const data = await invoke("load_technical_data", { filePath });
      setExcelData(data);
      setShowExcelBanner(false);
      alert("Excel loaded successfully!");
    } catch (err) {
      console.error("Error loading Excel data:", err);
      alert("Eroare la încărcarea Excel.");
    }
    setLoadingExcel(false);
  };

  // dacă s‑au încărcat date din Excel, le folosim, altfel pe cele din props
  const initialTasks = excelData ?? propTasks;

  return (
    <ComplexChecklistModal
      {...props}
      mode={mode}
      categoryName="Tehnic"
      initialTasks={initialTasks}
    >
      {isEditor && (
        <>
          {/* Banner și buton „Adaugă Excel” */}
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
              <Box sx={{ mt: 1, textAlign: "center" }}>
                <Button
                  variant="contained"
                  onClick={handleAddExcel}
                  disabled={loadingExcel}
                  startIcon={
                    <img src={excelIcon} alt="Excel Icon" style={{ width: 30, height: 30 }} />
                  }
                >
                  {loadingExcel ? "Loading Excel..." : "Adaugă Excel"}
                </Button>
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
                    <img src={excelIcon} alt="Excel Icon" style={{ width: 20, height: 20 }} />
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
