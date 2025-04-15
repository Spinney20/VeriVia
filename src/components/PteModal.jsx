import React from "react";
import ComplexChecklistModal from "./ComplexChecklistModal"; // Componenta generică reutilizabilă
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export default function PteModal(props) {
  // Se presupune că props conțin open, onClose, onConfirm, projectTitle, initialTasks etc.
  // Vom transmite tot props plus vom seta categoryName la "PTE/PCCVI".
  // În plus, incluzi bannerul persistent.
  return (
    <ComplexChecklistModal {...props} categoryName="PTE/PCCVI">
      {/* Banner persistent specific pentru PTE/PCCVI */}
      <Box
        sx={{
          mb: 2,
          p: 1,
          backgroundColor: "#fff3cd",
          border: "1px solid #ffecb5",
          borderRadius: "4px",
          textAlign: "center"
        }}
      >
        <Typography variant="body1" sx={{ fontWeight: "bold", color: "#856404" }}>
          ATENȚIE: Trebuie să se regăsească TOATE categoriile de lucrări
        </Typography>
      </Box>
    </ComplexChecklistModal>
  );
}
