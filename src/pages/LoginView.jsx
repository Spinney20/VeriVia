// src/pages/LoginView.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke }      from "@tauri-apps/api/tauri";
import { useAuth }     from "../auth/AuthContext";
import appIcon         from "../images/app_icon.ico";

// MUI
import {
  Paper,
  TextField,
  Button,
  Box,
  Checkbox,
  FormControlLabel,
  Typography,
  InputAdornment
} from "@mui/material";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import LockIcon          from "@mui/icons-material/Lock";

export default function LoginView() {
  /* ------------------------------------------------------------------ */
  /* Context + router                                                   */
  /* ------------------------------------------------------------------ */
  const { login } = useAuth();           //  ← ADĂUGAT
  const navigate  = useNavigate();

  /* ------------------------------------------------------------------ */
  /* State                                                              */
  /* ------------------------------------------------------------------ */
  // login
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [remember,  setRemember]  = useState(true);
  const [error,     setError]     = useState("");
  const [focusField,setFocusField]= useState(null);

  // register
  const [showReg, setShowReg] = useState(false);
  const [regMail, setRegMail] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regRoles,setRegRoles]= useState({
    eligibilitate:{ editor:false, verificator:false },
    financiar:    { editor:false, verificator:false },
    tehnic:       { editor:false, verificator:false },
    "pte/pccvi":  { editor:false, verificator:false }
  });
  const [regError,setRegError] = useState("");

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */
  const shouldShrink = (val, name) => focusField === name || Boolean(val);

  const labelSx = {
    "& .MuiInputLabel-root":                 { left:"40px" },
    "& .MuiInputLabel-root.MuiInputLabel-shrink": { left:"0px" }
  };

  /* ------------------------------------------------------------------ */
  /* Handlers                                                           */
  /* ------------------------------------------------------------------ */
  const handleSubmit = async e => {
    e.preventDefault();
    setError("");
    try {
      // login => actualizează contextul + localStorage
      await login(email.trim(), password, remember);
      navigate("/", { replace:true });
    } catch (err) {
      setError(String(err));
    }
  };

  const handleRegister = async () => {
    setRegError("");
    if (!regMail.trim() || !regPass) {
      setRegError("Completează toate câmpurile");
      return;
    }
    try {
      await invoke("auth_register", {
        mail:     regMail.trim(),
        password: regPass,
        roles:    regRoles
      });
      setShowReg(false);
    } catch (e) {
      setRegError(String(e));
    }
  };

  /* ------------------------------------------------------------------ */
  /* Render                                                             */
  /* ------------------------------------------------------------------ */
  return (
    <>
      {/* ---------------- LOGIN CARD ---------------- */}
      <Box sx={{ position:"fixed", inset:0 }}>
        <Paper
          component="form"
          onSubmit={handleSubmit}
          elevation={6}
          sx={{
            width:340, p:4,
            position:"absolute", right:120, top:"50%",
            transform:"translateY(-50%)",
            display:"flex", flexDirection:"column", gap:2
          }}
        >
          {/* logo + titlu */}
          <Box sx={{ display:"flex", justifyContent:"center", mb:1 }}>
            <Box component="img" src={appIcon} alt="logo"
                 sx={{ width:28, height:28, mr:1 }} />
            <Typography variant="h6">Verivia – Login</Typography>
          </Box>

          {/* e‑mail */}
          <TextField
            label="Email Viarom"
            type="email"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            required autoFocus
            onFocus={()=>setFocusField("email")}
            onBlur={()=>setFocusField(null)}
            InputLabelProps={{ shrink:shouldShrink(email,"email") }}
            InputProps={{
              startAdornment:(
                <InputAdornment position="start">
                  <EmailOutlinedIcon/>
                </InputAdornment>)
            }}
            sx={labelSx}
          />

          {/* parolă */}
          <TextField
            label="Parolă"
            type="password"
            value={password}
            onChange={e=>setPassword(e.target.value)}
            required
            onFocus={()=>setFocusField("password")}
            onBlur={()=>setFocusField(null)}
            InputLabelProps={{ shrink:shouldShrink(password,"password") }}
            InputProps={{
              startAdornment:(
                <InputAdornment position="start">
                  <LockIcon/>
                </InputAdornment>)
            }}
            sx={labelSx}
          />

          <FormControlLabel
            control={<Checkbox checked={remember}
                               onChange={e=>setRemember(e.target.checked)} />}
            label="Remember me"
          />

          {error && (
            <Typography sx={{ color:"error.main", fontSize:14 }}>
              {error}
            </Typography>
          )}

          <Button variant="contained" type="submit">Login</Button>

          <Box textAlign="center">
            <Typography variant="body2">
              Nu aveți un cont?{" "}
              <Button size="small" onClick={()=>setShowReg(true)}>
                Register
              </Button>
            </Typography>
          </Box>
        </Paper>
      </Box>

      {/* ---------------- REGISTER MODAL ---------------- */}
      {showReg && (
        <Box sx={{
          position:"fixed", inset:0,
          background:"rgba(0,0,0,0.6)", backdropFilter:"blur(4px)",
          display:"flex", alignItems:"center", justifyContent:"center",
          zIndex:9999
        }}>
          <Paper sx={{ width:360, p:4, borderRadius:2 }}>
            <Typography variant="h6" textAlign="center" mb={2}>
              Register User
            </Typography>

            <TextField
              fullWidth margin="normal" label="Email Viarom"
              value={regMail} onChange={e=>setRegMail(e.target.value)}
            />
            <TextField
              fullWidth margin="normal" label="Password" type="password"
              value={regPass} onChange={e=>setRegPass(e.target.value)}
            />

            <Box mt={2}>
              {Object.entries(regRoles).map(([cat, roles])=>(
                <Box key={cat} mb={1}>
                  <Typography variant="subtitle2"
                              textTransform="capitalize">{cat}</Typography>
                  {["editor","verificator"].map(r=>(
                    <FormControlLabel key={r}
                      control={
                        <Checkbox checked={roles[r]}
                          onChange={()=>setRegRoles(prev=>({
                            ...prev,
                            [cat]:{ ...prev[cat], [r]:!prev[cat][r] }
                          }))} />
                      }
                      label={r}
                      sx={{ ml:2 }}
                    />
                  ))}
                </Box>
              ))}
            </Box>

            {regError && (
              <Typography sx={{ color:"error.main", fontSize:14, mb:1 }}>
                {regError}
              </Typography>
            )}

            <Box display="flex" justifyContent="flex-end" gap={2} mt={2}>
              <Button onClick={()=>setShowReg(false)}>Cancel</Button>
              <Button variant="contained" onClick={handleRegister}>Save</Button>
            </Box>
          </Paper>
        </Box>
      )}
    </>
  );
}
