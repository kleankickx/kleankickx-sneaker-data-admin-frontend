import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  logout as logoutRequest,
  restoreSession,
  type AuthUser,
} from "./api";
import { startLogin, type LoginStep, type Permission } from "./access-api";

interface AuthContextValue {
  user: AuthUser | null;
  initializing: boolean;
  sessionExpired: boolean;
  /* Password step. Resolves to "done" when signed in, or the two-factor
     step the server asks for next. */
  login: (username: string, password: string) => Promise<LoginStep>;
  /* Finish signing in after the two-factor step. */
  completeLogin: (user: AuthUser) => void;
  /* Replace the signed-in user (after a password or two-factor change). */
  setUser: (user: AuthUser) => void;
  logout: () => Promise<void>;
  /* Whether the signed-in user holds a permission (superusers hold all). */
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  /* Bootstrap: ask the server who we are on mount, refreshing an
     expired access token first (see restoreSession). */
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const me = await restoreSession();
        if (!cancelled) {
          setUserState(me);
          setSessionExpired(false);
        }
      } catch {
        if (!cancelled) setUserState(null);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  /* Session expired: the axios interceptor fires this when a token
     refresh fails. A temporary password: the server refused a request
     until it's changed. */
  useEffect(() => {
    function onExpired() {
      setUserState(null);
      setSessionExpired(true);
    }
    function onPasswordChangeRequired() {
      setUserState((current) => (current ? { ...current, must_change_password: true } : current));
    }

    window.addEventListener("kkx:session-expired", onExpired);
    window.addEventListener("kkx:password-change-required", onPasswordChangeRequired);

    return () => {
      window.removeEventListener("kkx:session-expired", onExpired);
      window.removeEventListener("kkx:password-change-required", onPasswordChangeRequired);
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const step = await startLogin(username, password);
    if (step.kind === "done") {
      setUserState(step.user);
      setSessionExpired(false);
    }
    return step;
  }, []);

  const completeLogin = useCallback((signedIn: AuthUser) => {
    setUserState(signedIn);
    setSessionExpired(false);
  }, []);

  const setUser = useCallback((next: AuthUser) => setUserState(next), []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setUserState(null);
      setSessionExpired(false);
    }
  }, []);

  const can = useCallback(
    (permission: Permission) =>
      Boolean(user && (user.is_superuser || user.permissions?.includes(permission))),
    [user],
  );

  const value = useMemo(
    () => ({
      user,
      initializing,
      sessionExpired,
      login,
      completeLogin,
      setUser,
      logout,
      can,
    }),
    [user, initializing, sessionExpired, login, completeLogin, setUser, logout, can],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error(
      "useAuth must be used inside <AuthProvider>",
    );
  }

  return ctx;
}
