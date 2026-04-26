import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AdminApiError, adminLogin, adminLogout, fetchAdminMe } from './api';
import type { AdminSession } from './api';

interface AdminAuthContextValue {
  session: AdminSession | null;
  checked: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const me = await fetchAdminMe();
      setSession(me);
    } catch (err) {
      if (!(err instanceof AdminApiError) || err.status !== 401) {
        setSession(null);
      } else {
        setSession(null);
      }
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    await adminLogin(username, password);
    const me = await fetchAdminMe();
    setSession(me);
    setChecked(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await adminLogout();
    } finally {
      setSession(null);
    }
  }, []);

  const value = useMemo(() => ({ session, checked, login, logout, refresh }), [session, checked, login, logout, refresh]);

  return React.createElement(AdminAuthContext.Provider, { value }, children);
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
