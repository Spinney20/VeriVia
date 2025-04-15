// FinanciarModal.jsx
import React from "react";
import ComplexChecklistModal from "./ComplexChecklistModal";

export default function FinanciarModal(props) {
  return (
    <ComplexChecklistModal 
      {...props}
      categoryName="Financiar"
    />
  );
}
