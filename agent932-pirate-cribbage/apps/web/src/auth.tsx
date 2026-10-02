import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { type User, api } from "./api.js";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  signup: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: User | null }>("/api/auth/me")
      .then((r) => setUser(r.user))
      // No server (e.g. opened as a static page): play as a guest.
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (login: string, password: string) => {
    setUser((await api<{ user: User }>("/api/auth/login", { body: { login, password } })).user);
  }, []);
  const signup = useCallback(async (username: string, email: string, password: string) => {
    setUser(
      (await api<{ user: User }>("/api/auth/signup", { body: { username, email, password } })).user,
    );
  }, []);
  const logout = useCallback(async () => {
    await api("/api/auth/logout", { body: {} });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
