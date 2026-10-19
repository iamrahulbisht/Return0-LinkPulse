import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import type { Me } from '../types';

interface AuthState {
  me: Me | null;
  loading: boolean;
  /** Reload /auth/me (also refreshes sidebar counts). */
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setMe(await api.auth.me());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setMe(null);
      else throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [refresh]);

  const value = useMemo<AuthState>(
    () => ({
      me,
      loading,
      refresh,
      login: async (email, password) => {
        await api.auth.login(email, password);
        await refresh();
      },
      signup: async (name, email, password) => {
        await api.auth.signup(name, email, password);
        await refresh();
      },
      logout: async () => {
        await api.auth.logout().catch(() => undefined);
        setMe(null);
      },
    }),
    [me, loading, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
