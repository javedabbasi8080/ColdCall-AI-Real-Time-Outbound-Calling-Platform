import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getCookieName, verifyToken } from '@/lib/auth';

export async function GET() {
  const token = cookies().get(getCookieName())?.value;
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const user = await verifyToken(token);
  if (!user) {
    return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
  }

  return NextResponse.json(user);
}
