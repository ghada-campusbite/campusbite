import { NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/server';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearAuthCookies(res);
  res.cookies.delete('cb_role');
  return res;
}
