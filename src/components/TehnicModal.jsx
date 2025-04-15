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

export default function TehnicModal(props) {
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [excelData, setExcelData] = useState(null);
  const [excelLoaded, setExcelLoaded] = useState(false);
  // Bannerul este ascuns în mod implicit
  const [showExcelBanner, setShowExcelBanner] = useState(false);
  const [iconHovered, setIconHovered] = useState(false);

  const handleAddExcel = async () => {
    setLoadingExcel(true);
    try {
      // Deschidem file picker pentru a alege fișierul Excel
      const filePath = await open({
        filters: [{ name: "Excel Files", extensions: ["xlsx", "xls"] }],
        multiple: false,
      });
      if (!filePath) {
        setLoadingExcel(false);
        return;
      }
      // Apelează comanda Tauri și trimite calea fișierului ca argument
      const data = await invoke("load_technical_data", { filePath });
      setExcelData(data);
      setExcelLoaded(true);
      // După încărcare, ascundem bannerul (chiar dacă fusese afișat anterior)
      setShowExcelBanner(false);
      alert("Excel loaded successfully!");
    } catch (err) {
      console.error("Error loading Excel data:", err);
      alert("Eroare la încărcarea Excel.");
    }
    setLoadingExcel(false);
  };

  // Dacă excelData a fost încărcat, folosim aceste date ca initialTasks;
  // altfel, folosim props.initialTasks (dacă există)
  const initialTasks = excelData || props.initialTasks;

  return (
    <ComplexChecklistModal
      {...props}
      categoryName="Tehnic"
      initialTasks={initialTasks}
    >
      {/* Dacă bannerul este afișat, se vede mesajul și butonul pentru adăugare Excel */}
      {showExcelBanner && (
        <Box sx={{ position: "relative", mb: 2 }}>
          {/* Butonul mic de hide, poziționat în colțul din dreapta sus */}
          <IconButton
            size="small"
            onClick={() => setShowExcelBanner(false)}
            sx={{
              position: "absolute",
              top: 4,
              right: 4,
              color: "#555",
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
          <Box
            sx={{
              p: 1,
              backgroundColor: "#e2e3e5",
              border: "1px solid #d6d8db",
              borderRadius: "4px",
              textAlign: "center",
            }}
          >
            <Typography
              variant="body1"
              sx={{ fontWeight: "bold", color: "#383d41" }}
            >
              ATENȚIE: Categoriile și subcategoriile tehnice vor fi preluate automat din Excel.
            </Typography>
          </Box>
          <Box sx={{ mt: 1, textAlign: "center" }}>
            <Button
              variant="contained"
              onClick={handleAddExcel}
              disabled={loadingExcel}
              startIcon={
                <img
                  src={excelIcon}
                  alt="Excel Icon"
                  style={{ width: 30, height: 30 }}
                />
              }
            >
              {loadingExcel ? "Loading Excel..." : "Adaugă Excel"}
            </Button>
          </Box>
        </Box>
      )}

      {/* Dacă bannerul este ascuns, afișăm un buton pentru a-l "unhide" cu icon dinamic și icon Excel */}
      {!showExcelBanner && (
        <Box sx={{ mb: 2, textAlign: "center" }}>
          <Button
            variant="outlined"
            onMouseEnter={() => setIconHovered(true)}
            onMouseLeave={() => setIconHovered(false)}
            onClick={() => setShowExcelBanner(true)}
            startIcon={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <img
                  src={excelIcon}
                  alt="Excel Icon"
                  style={{ width: 20, height: 20 }}
                />
                {iconHovered ? <VisibilityIcon /> : <VisibilityOffIcon />}
              </Box>
            }
          >
            Afiseaza optiune incarcare Excel
          </Button>
        </Box>
      )}
    </ComplexChecklistModal>
  );
}
