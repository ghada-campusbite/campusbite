import { createContext, useContext, useEffect, useState } from 'react';
import { unregisterPush } from './push';
import { api, clearSession, endSession, hasSession, setAuthLostHandler, startSession } from './api';

type Ctx = {
  ready: boolean; signedIn: boolean; verified: boolean | null; refreshMe: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  const refreshMe = async () => {
    try { setVerified(!!(await api<{ emailVerified: boolean }>('/auth/me')).emailVerified); } catch { /* keep last state */ }
  };
  useEffect(() => { if (signedIn) refreshMe(); else setVerified(null); }, [signedIn]);
  useEffect(() => {
    setAuthLostHandler(() => { clearSession(); setSignedIn(false); });
    hasSession().then((v) => { setSignedIn(v); setReady(true); });
  }, []);
  const value: Ctx = {
    ready, signedIn, verified, refreshMe,
    signIn: async (email, password) => { await startSession('/auth/login', { email: email.trim(), password }); setSignedIn(true); },
    register: async (name, email, password) => { await startSession('/auth/register', { name: name.trim(), email: email.trim(), password }); setSignedIn(true); },
    signOut: async () => { await unregisterPush(); await endSession(); setSignedIn(false); },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
