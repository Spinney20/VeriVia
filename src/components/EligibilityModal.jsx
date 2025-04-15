// src/components/EligibilityModal.jsx
import React from "react";
import ComplexChecklistModal from "./ComplexChecklistModal";

export default function EligibilityModal(props) {
  return (
    <ComplexChecklistModal
      {...props}
      categoryName="Eligibilitate"
    />
  );
}
