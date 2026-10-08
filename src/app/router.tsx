import { createBrowserRouter, Navigate } from "react-router-dom";

import AdminLayout from "../components/layout/AdminLayout";
import ProtectedRoute from "../lib/protected-route";

import DashboardPage from "../pages/DashboardPage";
import BatchesPage from "../pages/BatchesPage";
import BatchDetailsPage from "../pages/BatchDetailsPage";
import SneakersPage from "../pages/SneakersPage";
import SneakerDetailsPage from "../pages/SneakerDetailsPage";
import VerificationPage from "../pages/VerificationPage";
import ReviewQueuePage from "../pages/ReviewQueuePage";
import LoginPage from "../pages/LoginPage";

export const router = createBrowserRouter([
  /* ------------------------------------------------------------------
     Public routes
     ------------------------------------------------------------------ */
  {
    path: "/login",
    element: <LoginPage />,
  },

  /* ------------------------------------------------------------------
     Protected: everything under AdminLayout requires auth
     ------------------------------------------------------------------ */
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: "batches",
        element: <BatchesPage />,
      },
      {
        path: "batches/:batchId",
        element: <BatchDetailsPage />,
      },
      {
        path: "sneakers",
        element: <SneakersPage />,
      },
      {
        path: "sneakers/:sneakerId",
        element: <SneakerDetailsPage />,
      },
      {
        path: "verification",
        element: <VerificationPage />,
      },
      {
        path: "review-queue",
        element: <ReviewQueuePage />,
      },
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