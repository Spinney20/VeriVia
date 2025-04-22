import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) return null;              // poţi pune un spinner
  if (!user)  return <Navigate to="/login" replace />;

  return <Outlet />;                     // rutele “protejate” merg mai departe
}
