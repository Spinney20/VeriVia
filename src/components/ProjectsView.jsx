import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";

// MUI
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import { RichTreeView } from "@mui/x-tree-view/RichTreeView";
import TextField from "@mui/material/TextField";

export default function ProjectsView() {
  const [expandedItems, setExpandedItems] = useState([]);
  const [dbData, setDbData] = useState({ projects: [] });

  // State pentru modalul "Add Project"
  const [showModal, setShowModal] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectDate, setNewProjectDate] = useState("");

  async function fetchDbData() {
    try {
      const data = await invoke("load_projects");
      setDbData(data);
    } catch (err) {
      console.error("Eroare la load_projects:", err);
    }
  }

  useEffect(() => {
    fetchDbData();
  }, []);

  const treeItems = dbData.projects.map((proj) => ({
    id: `proj-${proj.id}`,
    label: `${proj.date} - ${proj.title}`,
    children: proj.categories.map((cat, catIndex) => ({
      id: `cat-${proj.id}-${catIndex}`,
      label: cat.name,
      children: cat.checklist.map((item, itemIndex) => ({
        id: `item-${proj.id}-${catIndex}-${itemIndex}`,
        label: `${item.name} - ${item.status}`,
        children: []
      }))
    }))
  }));

  const handleExpandedItemsChange = (_, itemIds) => {
    setExpandedItems(itemIds);
  };

  const handleExpandClick = () => {
    if (expandedItems.length === 0) {
      const allIds = [];
      treeItems.forEach((p) => {
        allIds.push(p.id);
        p.children.forEach((c) => {
          allIds.push(c.id);
          c.children.forEach((child) => {
            allIds.push(child.id);
          });
        });
      });
      setExpandedItems(allIds);
    } else {
      setExpandedItems([]);
    }
  };

  const handleItemSelect = (_, itemId) => {
    console.log("Select item:", itemId);
  };

  // Modal functions pentru "Add Project"
  const handleOpenAddModal = () => {
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setNewProjectTitle("");
    setNewProjectDate("");
  };

  const handleSubmitProject = async () => {
    console.log("Submit clicked", newProjectTitle, newProjectDate);
    if (!newProjectTitle.trim() || !newProjectDate.trim()) {
      alert("Te rog completează toate câmpurile.");
      return;
    }
    try {
      await invoke("add_project", { title: newProjectTitle, date: newProjectDate });
      alert("Proiect adăugat cu succes!");
      handleCloseModal();
      fetchDbData();
    } catch (err) {
      console.error("Eroare la add_project:", err);
    }
  };

  return (
    <Stack
      spacing={2}
      sx={{
        backgroundColor: "transparent"
      }}
    >
      {/* Butonul de deschidere modal "Add Project" */}
      <Button variant="contained" onClick={handleOpenAddModal}>
        ADAUGA PROIECT
      </Button>

      <Button variant="contained" onClick={handleExpandClick}>
        {expandedItems.length === 0 ? "EXPAND ALL" : "COLLAPSE ALL"}
      </Button>

      <Box
        sx={{
          minWidth: 250,
          backgroundColor: "transparent"
        }}
      >
        <RichTreeView
          sx={{
            backgroundColor: "transparent",
            color: "#fff",
            "& .MuiTreeItem-root": {
              backgroundColor: "transparent"
            }
          }}
          items={treeItems}
          expandedItems={expandedItems}
          onExpandedItemsChange={handleExpandedItemsChange}
          onSelectedItemsChange={handleItemSelect}
        />
      </Box>

      {/* Modal "Add Project" */}
      {showModal && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Box
            sx={{
              backgroundColor: "rgba(255, 255, 255, 0.9)",
              borderRadius: 2,
              padding: 4,
              boxShadow: "0px 4px 15px rgba(0,0,0,0.3)",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              minWidth: 300
            }}
          >
            <TextField
              label="Nume proiect"
              variant="outlined"
              value={newProjectTitle}
              onChange={(e) => setNewProjectTitle(e.target.value)}
              fullWidth
            />
            <TextField
              label="Data proiect (MM.DD.YYYY)"
              variant="outlined"
              value={newProjectDate}
              onChange={(e) => setNewProjectDate(e.target.value)}
              fullWidth
            />
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Button variant="outlined" onClick={handleCloseModal}>
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                    console.log("Butonul Submit a fost apasat");
                    handleSubmitProject();
                }}
                >
                Submit
                </Button>
            </Box>
          </Box>
        </Box>
      )}
    </Stack>
  );
}
