import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store has no web implementation; the web preview falls back to localStorage
export const store = Platform.OS === 'web' ? {
  getItemAsync: async (k: string) => globalThis.localStorage?.getItem(k) ?? null,
  setItemAsync: async (k: string, v: string) => { globalThis.localStorage?.setItem(k, v); },
  deleteItemAsync: async (k: string) => { globalThis.localStorage?.removeItem(k); },
} : SecureStore;

const BASE = (process.env as any).EXPO_PUBLIC_API_URL ?? (globalThis as any).__CB_API_URL ?? '';
// menu images are served from /menu/:id/image on the same server
export const ORIGIN = BASE.replace(/\/api\/v1\/?$/, '');
// fail fast: release builds must never send passwords over plain http
// (loopback is exempt: browsers treat localhost as a secure context for local testing)
const loopback = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE);
if (!__DEV__ && !(BASE.startsWith('https://') || loopback)) throw new Error('EXPO_PUBLIC_API_URL must be https in production');

const JSON_H = { 'content-type': 'application/json' };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let onAuthLost: () => void = () => {};
export const setAuthLostHandler = (fn: () => void) => { onAuthLost = fn; };

export const hasSession = async () => !!(await store.getItemAsync('rt'));
async function save(t: { accessToken: string; refreshToken: string }) {
  await store.setItemAsync('at', t.accessToken);
  await store.setItemAsync('rt', t.refreshToken);
}
export async function clearSession() {
  await store.deleteItemAsync('at');
  await store.deleteItemAsync('rt');
}

// single-flight: refresh tokens rotate, so concurrent refreshes would invalidate each other
let refreshing: Promise<boolean> | null = null;
function refresh() {
  if (!refreshing) {
    refreshing = (async () => {
      const rt = await store.getItemAsync('rt');
      if (!rt) return false;
      try {
        const r = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: JSON_H, body: JSON.stringify({ refreshToken: rt }) });
        if (!r.ok) { if (r.status === 401) await clearSession(); return false; }
        await save(await r.json());
        return true;
      } catch { return false; }
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

function message(body: any, status: number) {
  const m = body?.message;
  if (Array.isArray(m)) return m.join('، ');
  return typeof m === 'string' ? m : `خطأ (${status})`;
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = init;
  const call = async () => {
    const at = auth ? await store.getItemAsync('at') : null;
    return fetch(`${BASE}${path}`, {
      method, headers: { ...JSON_H, ...(at ? { authorization: `Bearer ${at}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };
  let res: Response;
  try { res = await call(); } catch { throw new ApiError(0, 'مفيش اتصال بالإنترنت'); }
  if (res.status === 401 && auth) {
    if (await refresh()) res = await call();
    else { onAuthLost(); throw new ApiError(401, 'سجّل دخول تاني'); }
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, message(data, res.status));
  return data as T;
}

export async function startSession(path: '/auth/login' | '/auth/register', payload: object) {
  await save(await api(path, { method: 'POST', body: payload, auth: false }));
}
export async function endSession() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  await clearSession();
}
