import { Navigate, Route, Routes } from "react-router-dom";
import { GooeyDefs } from "./components/ui/Button";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { AdminLayout } from "./components/layout/AdminLayout";
import { UserLayout } from "./components/layout/UserLayout";
import { MdLayout } from "./components/layout/MdLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/admin/DashboardPage";
import { OrdersPage } from "./pages/admin/OrdersPage";
import { CreateOrderAdminPage } from "./pages/admin/CreateOrderAdminPage";
import { OrderDetailPage } from "./pages/admin/OrderDetailPage";
import { OutputPage } from "./pages/admin/OutputPage";
import { UsersPage } from "./pages/admin/UsersPage";
import { AssignWorkPage } from "./pages/admin/AssignWorkPage";
import { StageRolesPage } from "./pages/admin/StageRolesPage";
import { AccountManagementPage } from "./pages/admin/AccountManagementPage";
import { HomePage } from "./pages/user/HomePage";
import { DataInputPage } from "./pages/user/DataInputPage";
import { CreateOrderPage } from "./pages/user/CreateOrderPage";
import { MdUsersPage } from "./pages/md/MdUsersPage";
import { WorkflowMapPage } from "./pages/md/WorkflowMapPage";
import { WorkflowMapStagePage } from "./pages/md/WorkflowMapStagePage";

export default function App() {
  return (
    <>
      {/* Mounted once, referenced by every primary/danger Button's gooey
          hover effect — an SVG filter id must be unique document-wide. */}
      <GooeyDefs />
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
          <Route path="orders/new" element={<CreateOrderAdminPage />} />
          <Route path="orders/:orderId" element={<OrderDetailPage />} />
          <Route path="output/:orderId" element={<OutputPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="assign" element={<AssignWorkPage />} />
          <Route path="stage-roles" element={<StageRolesPage />} />
          <Route path="account-management" element={<AccountManagementPage />} />
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
          <Route path="create-order" element={<CreateOrderPage />} />
        </Route>

        <Route
          path="/md"
          element={
            <ProtectedRoute requireMd>
              <MdLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="orders/:orderId" element={<OrderDetailPage />} />
          <Route path="output/:orderId" element={<OutputPage />} />
          <Route path="users" element={<MdUsersPage />} />
          <Route path="workflow-map" element={<WorkflowMapPage />} />
          <Route path="workflow-map/:orderId/:stageKey" element={<WorkflowMapStagePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  );
}
