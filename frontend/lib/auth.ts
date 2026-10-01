import { jwtVerify } from 'jose';
import type { User } from '@/types';

const COOKIE_NAME = 'auth_token';

export function getCookieName() {
  return COOKIE_NAME;
}

export async function verifyToken(token: string): Promise<User | null> {
  try {
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production',
    );
    const { payload } = await jwtVerify(token, secret);
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      name: (payload.name as string) || (payload.email as string),
      role: payload.role as User['role'],
    };
  } catch {
    return null;
  }
}
