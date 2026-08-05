import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Loader } from "../ui/Loader";

export function ProtectedRoute({
  children,
  requireAdmin = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
}) {
  const { appUser, loading } = useAuth();

  if (loading) return <Loader full label="Checking session…" />;
  if (!appUser) return <Navigate to="/login" replace />;
  if (requireAdmin && appUser.role !== "admin") return <Navigate to="/user/home" replace />;
  if (!requireAdmin && appUser.role === "admin") return <Navigate to="/admin/dashboard" replace />;

  return <>{children}</>;
}
