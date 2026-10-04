import { useEffect, useState } from "react";
import {
  Navigate,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import { useAuth } from "../lib/auth-context";

function getErrorMessage(error: any) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.response?.data?.detail ||
    error?.message ||
    "Unable to sign in."
  );
}

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();

  const continueTo = searchParams.get("continue") || "/";
  const reason = searchParams.get("reason");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /* Show a one-time notice when the user was bounced due to an
     expired session. */
  useEffect(() => {
    if (reason === "session_expired") {
      setNotice(
        "Your session expired. Please sign in again to continue.",
      );
    }
  }, [reason]);

  /* If already signed in, bounce straight through. */
  useEffect(() => {
    if (user) {
      navigate(continueTo, { replace: true });
    }
  }, [user, navigate, continueTo]);

  if (user) {
    return <Navigate to={continueTo} replace />;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      await login(username.trim(), password);
      navigate(continueTo, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-900 text-white">
            <span className="material-symbols-outlined text-[28px]">
              steps
            </span>
          </div>

          <h1 className="mt-5 text-2xl font-bold tracking-tight text-gray-900">
            KleanKickx
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Sign in to the Sneaker Data Platform
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7">
          <form onSubmit={handleSubmit} className="space-y-5">
            {notice && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                <span className="material-symbols-outlined text-[20px] text-amber-600">
                  info
                </span>

                <p className="flex-1 text-sm leading-5 text-amber-800">
                  {notice}
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5">
                <span className="material-symbols-outlined text-[20px] text-red-600">
                  error
                </span>

                <p className="flex-1 text-sm leading-5 text-red-700">
                  {error}
                </p>
              </div>
            )}

            <div>
              <label
                htmlFor="username"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Username
              </label>

              <input
                id="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={username}
                onChange={(event) =>
                  setUsername(event.target.value)
                }
                placeholder="your-username"
                className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none placeholder:text-gray-400 focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Password
              </label>

              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="••••••••"
                  className="h-11 w-full rounded-lg border border-gray-300 px-3 pr-11 text-sm outline-none placeholder:text-gray-400 focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword((current) => !current)
                  }
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword
                      ? "visibility_off"
                      : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && (
                <span className="material-symbols-outlined animate-spin text-[18px]">
                  progress_activity
                </span>
              )}

              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          KleanKickx sneaker intake — internal use only
        </p>
      </div>
    </div>
  );
}