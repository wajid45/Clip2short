import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export interface Me {
  id: string;
  email: string;
  name: string | null;
  authenticatorSince: string | null;
}

interface AuthState {
  me: Me | null;
  ready: boolean;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState>({ me: null, ready: false, reload: async () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    try {
      setMe(await api<Me>("/auth/me"));
    } catch {
      setMe(null);
    } finally {
      setReady(true);
    }
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { body: {} }).catch(() => {});
    setMe(null);
  }, []);

  useEffect(() => {
    void reload();
    const onOut = () => setMe(null);
    window.addEventListener("sl-admin:signed-out", onOut);
    return () => window.removeEventListener("sl-admin:signed-out", onOut);
  }, [reload]);

  return <Ctx.Provider value={{ me, ready, reload, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
