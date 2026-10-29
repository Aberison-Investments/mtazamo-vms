import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, tokenStore, type AuthUser } from "./api";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (token: string, user: AuthUser, refreshToken?: string) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On boot, restore the session from a stored token.
  useEffect(() => {
    let cancelled = false;
    const token = tokenStore.get();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(({ user }) => {
        if (!cancelled) setUser(user);
      })
      .catch(() => {
        tokenStore.clear();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Handle session expiry events dispatched by the request() interceptor
  // when a refresh token rotation fails (e.g., device was revoked).
  useEffect(() => {
    const handler = () => {
      tokenStore.clear();
      setUser(null);
    };
    window.addEventListener("mtazamo:session-expired", handler);
    return () => window.removeEventListener("mtazamo:session-expired", handler);
  }, []);

  const signIn = (token: string, u: AuthUser, refreshToken?: string) => {
    tokenStore.set(token);
    if (refreshToken) tokenStore.setRefresh(refreshToken);
    setUser(u);
  };

  const signOut = async () => {
    try {
      await api.logout();
    } catch {
      /* best-effort */
    }
    tokenStore.clear();
    setUser(null);
  };

  const refresh = async () => {
    const { user } = await api.me();
    setUser(user);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
