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
  login as loginRequest,
  logout as logoutRequest,
  restoreSession,
  type AuthUser,
} from "./api";

interface AuthContextValue {
  user: AuthUser | null;
  initializing: boolean;
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
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
          setUser(me);
          setSessionExpired(false);
        }
      } catch {
        if (!cancelled) setUser(null);
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
     refresh fails. */
  useEffect(() => {
    function onExpired() {
      setUser(null);
      setSessionExpired(true);
    }

    window.addEventListener("kkx:session-expired", onExpired);

    return () => {
      window.removeEventListener("kkx:session-expired", onExpired);
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { user: loggedInUser } = await loginRequest(
        email,
        password,
      );
      setUser(loggedInUser);
      setSessionExpired(false);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setUser(null);
      setSessionExpired(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      initializing,
      sessionExpired,
      login,
      logout,
    }),
    [user, initializing, sessionExpired, login, logout],
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