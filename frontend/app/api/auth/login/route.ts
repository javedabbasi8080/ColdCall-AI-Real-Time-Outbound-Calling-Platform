import { NextResponse } from 'next/server';
import { getCookieName } from '@/lib/auth';

export async function POST(request: Request) {
  const body = await request.json();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  const res = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Login failed' }));
    return NextResponse.json(err, { status: res.status });
  }

  const data = await res.json();
  const response = NextResponse.json({
    user: data.user,
  });

  response.cookies.set(getCookieName(), data.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  return response;
}
