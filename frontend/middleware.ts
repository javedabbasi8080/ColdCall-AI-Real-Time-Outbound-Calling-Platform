import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken, getCookieName } from '@/lib/auth';

const publicPaths = ['/login', '/register'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const isPublic = publicPaths.some((p) => pathname.startsWith(p));
  const token = request.cookies.get(getCookieName())?.value;

  if (isPublic) {
    if (token) {
      const user = await verifyToken(token);
      if (user) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const user = await verifyToken(token);
  if (!user) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete(getCookieName());
    return response;
  }

  if (pathname.startsWith('/register') && user.role !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
