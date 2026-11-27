import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  if (!req.cookies.get('cb_refresh')) return NextResponse.redirect(new URL('/login', req.url));
  // admin area is for ADMIN-marked sessions; the API still enforces the real check on every call
  if (req.nextUrl.pathname.startsWith('/admin') && req.cookies.get('cb_role')?.value !== 'ADMIN') {
    return NextResponse.redirect(new URL('/', req.url));
  }
  return NextResponse.next();
}
export const config = { matcher: ['/((?!_next|api|login|forgot|favicon.ico).*)'] };
