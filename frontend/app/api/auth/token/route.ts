import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getCookieName } from '@/lib/auth';

export async function GET() {
  const token = cookies().get(getCookieName())?.value;
  if (!token) {
    return NextResponse.json({ token: null }, { status: 401 });
  }
  return NextResponse.json({ token });
}
