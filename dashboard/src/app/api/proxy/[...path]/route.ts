import { NextRequest, NextResponse } from 'next/server';
import { API, clearAuthCookies, fwdHeaders, sameOrigin, setAuthCookies } from '@/lib/server';

const UUID = '[0-9a-fA-F-]{36}';
// only the endpoints the dashboard needs are reachable through the proxy
const ALLOW = [
  /^orders\/canteen$/, new RegExp(`^orders/${UUID}/status$`),
  /^menu\/mine$/, /^menu$/, new RegExp(`^menu/${UUID}$`), new RegExp(`^menu/${UUID}/image$`),
  /^canteen\/mine$/, /^canteen\/summary$/,
  // admin
  /^admin\/universities$/, /^admin\/canteens$/, new RegExp(`^admin/canteens/${UUID}$`), /^admin\/breaks$/, /^admin\/staff$/,
  /^admin\/students(\?.*)?$/, new RegExp(`^admin/users/${UUID}/(un)?suspend$`), /^admin\/orders(\?.*)?$/, /^admin\/analytics$/, /^admin\/settings$/, /^admin\/campuses$/,
  // unauthenticated endpoints used by the staff forgot-password screen
  /^auth\/forgot$/, /^auth\/reset$/,
];

async function handle(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/') + (req.nextUrl.search ?? '');
  if (!ALLOW.some((r) => r.test(path))) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (req.method !== 'GET' && !sameOrigin(req)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  const access = req.cookies.get('cb_access')?.value;
  const refresh = req.cookies.get('cb_refresh')?.value;
  // forward the original content type so menu image uploads (multipart) survive the proxy
  const contentType = req.headers.get('content-type') ?? 'application/json';
  const body = req.method === 'GET' ? undefined : Buffer.from(await req.arrayBuffer());
  const call = (t?: string) =>
    fetch(`${API}/${path}`, {
      method: req.method,
      headers: { 'content-type': contentType, ...fwdHeaders(req), ...(t ? { authorization: `Bearer ${t}` } : {}) },
      body, cache: 'no-store',
    });

  let res = await call(access);
  let fresh: { accessToken: string; refreshToken: string } | null = null;
  if (res.status === 401 && refresh) {
    const r = await fetch(`${API}/auth/refresh`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...fwdHeaders(req) }, body: JSON.stringify({ refreshToken: refresh }), cache: 'no-store',
    });
    if (r.ok) { fresh = await r.json(); res = await call(fresh!.accessToken); }
  }
  const out = new NextResponse(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
  if (fresh) setAuthCookies(out, fresh);
  else if (res.status === 401) clearAuthCookies(out);
  return out;
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
