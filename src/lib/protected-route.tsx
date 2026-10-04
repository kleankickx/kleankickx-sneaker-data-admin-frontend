import {
  Navigate,
  useLocation,
} from "react-router-dom";
import { useAuth } from "./auth-context";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, initializing, sessionExpired } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="material-symbols-outlined animate-spin text-[18px]">
            progress_activity
          </span>
          Loading…
        </div>
      </div>
    );
  }

  if (!user) {
    const params = new URLSearchParams();

    /* Preserve the path the user was trying to reach, including
       its query string if any. */
    const returnTo =
      location.pathname + location.search;
    params.set("continue", returnTo);

    if (sessionExpired) {
      params.set("reason", "session_expired");
    }

    return (
      <Navigate
        to={`/login?${params.toString()}`}
        replace
      />
    );
  }

  return <>{children}</>;
}