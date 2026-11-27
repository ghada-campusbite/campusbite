import { NextRequest, NextResponse } from 'next/server';

export const API = process.env.API_URL ?? 'http://localhost:3000/api/v1';

export function setAuthCookies(res: NextResponse, t: { accessToken: string; refreshToken: string }) {
  const base = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/' };
  res.cookies.set('cb_access', t.accessToken, { ...base, maxAge: 15 * 60 });
  res.cookies.set('cb_refresh', t.refreshToken, { ...base, maxAge: 7 * 24 * 3600 });
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.delete('cb_access');
  res.cookies.delete('cb_refresh');
}

// the API sits behind this server, so without this every user would share the dashboard's IP in the rate limiter
export function fwdHeaders(req: NextRequest): Record<string, string> {
  const xff = req.headers.get('x-forwarded-for');
  return xff ? { 'x-forwarded-for': xff } : {};
}

// CSRF defence in depth (on top of SameSite=Strict): state-changing calls must come from our own origin
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).host === req.headers.get('host'); } catch { return false; }
}
