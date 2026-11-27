import { NextRequest, NextResponse } from 'next/server';
import { API, fwdHeaders, sameOrigin, setAuthCookies } from '@/lib/server';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  let body: { email?: unknown; password?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ message: 'Bad request' }, { status: 400 }); }
  if (typeof body.email !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ message: 'Bad request' }, { status: 400 });
  }
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...fwdHeaders(req) },
    body: JSON.stringify({ email: body.email, password: body.password }), cache: 'no-store',
  });
  if (r.status === 429) return NextResponse.json({ message: 'محاولات كتير، جرّب بعد دقيقة' }, { status: 429 });
  if (r.status === 403) return NextResponse.json({ message: 'الحساب ده موقوف' }, { status: 403 });
  if (!r.ok) return NextResponse.json({ message: 'الإيميل أو الباسورد غلط' }, { status: 401 });
  const tokens = await r.json();
  // token comes straight from our own API over a server-to-server call, so reading its payload is safe here
  const role = JSON.parse(Buffer.from(String(tokens.accessToken).split('.')[1], 'base64url').toString()).role;
  if (role !== 'CANTEEN_STAFF' && role !== 'ADMIN') return NextResponse.json({ message: 'الحساب ده مش حساب مطعم أو أدمن' }, { status: 403 });
  const res = NextResponse.json({ ok: true, role });
  setAuthCookies(res, tokens);
  // readable marker for the nav/middleware; the authority stays the httpOnly JWT
  res.cookies.set('cb_role', role, { secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 7 * 24 * 3600 });
  return res;
}
