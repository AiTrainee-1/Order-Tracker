import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Loader } from "../ui/Loader";

/** Where a signed-in user belongs, by role. */
function homeFor(role: string): string {
  if (role === "admin") return "/admin/dashboard";
  if (role === "md") return "/md/dashboard";
  return "/user/home";
}

export function ProtectedRoute({
  children,
  requireAdmin = false,
  requireMd = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireMd?: boolean;
}) {
  const { appUser, loading } = useAuth();

  if (loading) return <Loader full label="Checking session…" />;
  if (!appUser) return <Navigate to="/login" replace />;

  if (requireAdmin && appUser.role !== "admin") return <Navigate to={homeFor(appUser.role)} replace />;
  if (requireMd && appUser.role !== "md") return <Navigate to={homeFor(appUser.role)} replace />;
  // Plain (floor-worker) routes: admin and MD each have their own home, so
  // neither belongs here even though this branch itself requires nothing.
  if (!requireAdmin && !requireMd && (appUser.role === "admin" || appUser.role === "md")) {
    return <Navigate to={homeFor(appUser.role)} replace />;
  }

  return <>{children}</>;
}
