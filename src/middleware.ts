import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/login', '/register', '/invite', '/register-employee'];
const ADMIN_ROUTES = ['/people', '/reports', '/invoices', '/organization', '/security'];

export function middleware(req: NextRequest) {
  const token = req.cookies.get('accessToken')?.value;
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r)) || pathname === '/';
  if (!token && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r));
      if (isAdminRoute && payload.role === 'employee') {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    } catch {}
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|favicon|_static).*)'],
};
