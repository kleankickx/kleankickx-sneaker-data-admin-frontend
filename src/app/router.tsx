import type { ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import AdminLayout from "../components/layout/AdminLayout";
import RequirePermission from "../components/access/RequirePermission";
import type { Permission } from "../lib/access-api";
import ProtectedRoute from "../lib/protected-route";

import DashboardPage from "../pages/DashboardPage";
import BatchesPage from "../pages/BatchesPage";
import BatchDetailsPage from "../pages/BatchDetailsPage";
import SneakersPage from "../pages/SneakersPage";
import SneakerDetailsPage from "../pages/SneakerDetailsPage";
import VerificationPage from "../pages/VerificationPage";
import ReviewQueuePage from "../pages/ReviewQueuePage";
import PipelineMonitorPage from "../pages/PipelineMonitorPage";
import PipelineRunPage from "../pages/PipelineRunPage";
import BulkRunPage from "../pages/BulkRunPage";
import AccountPage from "../pages/AccountPage";
import UsersPage from "../pages/UsersPage";
import RolesPage from "../pages/RolesPage";
import AuditLogPage from "../pages/AuditLogPage";
import LoginPage from "../pages/LoginPage";
import ForgotPasswordPage from "../pages/ForgotPasswordPage";
import ResetPasswordPage from "../pages/ResetPasswordPage";

/* The page, for users holding any of `permissions`. */
function gated(permissions: Permission[], page: ReactNode) {
  return <RequirePermission permissions={permissions}>{page}</RequirePermission>;
}

export const router = createBrowserRouter([
  /* ------------------------------------------------------------------
     Public routes
     ------------------------------------------------------------------ */
  {
    path: "/login",
    element: <LoginPage />,
  },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  /* The link in the reset email: ?uid=...&token=... */
  { path: "/reset-password", element: <ResetPasswordPage /> },

  /* ------------------------------------------------------------------
     Protected: everything under AdminLayout requires auth, and each
     page the permission it needs (the API checks them too).
     ------------------------------------------------------------------ */
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: gated(["view_batches"], <DashboardPage />) },
      { path: "batches", element: gated(["view_batches"], <BatchesPage />) },
      { path: "batches/:batchId", element: gated(["view_batches"], <BatchDetailsPage />) },
      { path: "sneakers", element: gated(["view_batches"], <SneakersPage />) },
      { path: "sneakers/:sneakerId", element: gated(["view_batches"], <SneakerDetailsPage />) },
      { path: "verification", element: gated(["verify_pairs"], <VerificationPage />) },
      { path: "review-queue", element: gated(["verify_pairs"], <ReviewQueuePage />) },
      { path: "pipeline-monitor", element: gated(["view_pipeline"], <PipelineMonitorPage />) },
      { path: "pipeline-monitor/runs/:runId", element: gated(["view_pipeline"], <PipelineRunPage />) },
      { path: "pipeline-monitor/bulk/:bulkId", element: gated(["view_pipeline"], <BulkRunPage />) },

      /* Everyone: their own account. */
      { path: "account", element: <AccountPage /> },

      /* Settings */
      { path: "settings/users", element: gated(["manage_users"], <UsersPage />) },
      { path: "settings/roles", element: gated(["manage_roles", "manage_users"], <RolesPage />) },
      { path: "settings/audit-log", element: gated(["view_audit_log"], <AuditLogPage />) },
    ],
  },

  /* ------------------------------------------------------------------
     Fallback
     ------------------------------------------------------------------ */
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
