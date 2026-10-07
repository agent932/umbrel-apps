import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { type User, api } from "./api.js";

interface AuthState {
  user: User | null;
  loading: boolean;
  /** The shop is open to players (from /api/auth/me). False until it says so: an older server, or
   *  no server at all, keeps the shop hidden. Admins see it anyway, as a preview. */
  shopOpen: boolean;
  login: (login: string, password: string) => Promise<void>;
  signup: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-read the signed-in user (e.g. after a ranked game changes your rating). */
  refresh: () => Promise<void>;
}

/** GET /api/auth/me. `shopOpen` is missing from servers older than the shop. */
interface Me {
  user: User | null;
  shopOpen?: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [shopOpen, setShopOpen] = useState(false);

  useEffect(() => {
    api<Me>("/api/auth/me")
      .then((r) => {
        setUser(r.user);
        setShopOpen(r.shopOpen === true);
      })
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
  const refresh = useCallback(async () => {
    const r = await api<Me>("/api/auth/me");
    setUser(r.user);
    setShopOpen(r.shopOpen === true);
  }, []);
  const logout = useCallback(async () => {
    await api("/api/auth/logout", { body: {} });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, shopOpen, login, signup, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
