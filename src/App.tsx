import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { AdminLayout } from "./components/layout/AdminLayout";
import { UserLayout } from "./components/layout/UserLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/admin/DashboardPage";
import { OrdersPage } from "./pages/admin/OrdersPage";
import { OrderDetailPage } from "./pages/admin/OrderDetailPage";
import { UsersPage } from "./pages/admin/UsersPage";
import { AssignWorkPage } from "./pages/admin/AssignWorkPage";
import { StageRolesPage } from "./pages/admin/StageRolesPage";
import { HomePage } from "./pages/user/HomePage";
import { DataInputPage } from "./pages/user/DataInputPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute requireAdmin>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:orderId" element={<OrderDetailPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="assign" element={<AssignWorkPage />} />
        <Route path="stage-roles" element={<StageRolesPage />} />
      </Route>

      <Route
        path="/user"
        element={
          <ProtectedRoute>
            <UserLayout />
          </ProtectedRoute>
        }
      >
        <Route path="home" element={<HomePage />} />
        <Route path="data-input" element={<DataInputPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
