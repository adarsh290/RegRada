import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import api from "../services/api";

interface AuthUser {
  id: string;
  username: string;
  role: "CO" | "DEPARTMENT";
  department_name?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session via /auth/me on mount (no sessionStorage caching)
  useEffect(() => {
    const controller = new AbortController();
    const fetchUser = async () => {
      try {
        const res = await api.get("/auth/me", { signal: controller.signal });
        setUser(res.data);
      } catch (err: any) {
        if (err.name !== 'CanceledError') {
          setUser(null);
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchUser();
    return () => controller.abort();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post(`/auth/login`, { username, password });
    const { user: newUser } = res.data;
    setUser(newUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post(`/auth/logout`, {});
    } catch (err) {
      // BUG-SEC-036: Remove console.log of full error on logout
      console.error("Failed to call logout endpoint on backend");
    }
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, logout, isLoading }), [user, login, logout, isLoading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
