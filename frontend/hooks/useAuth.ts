'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { setAuthToken } from '@/lib/api';
import { resetAuthBootstrap } from '@/lib/auth-session';
import { useAuthStore } from '@/stores/useAuthStore';

export function useAuth() {
  const router = useRouter();
  const { user, setUser, clearUser } = useAuthStore();

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Login failed');
      }
      const data = await res.json();
      const tokenRes = await fetch('/api/auth/token');
      let token: string | null = null;
      if (tokenRes.ok) {
        const body = await tokenRes.json();
        token = body.token ?? null;
        if (token) setAuthToken(token);
      }
      resetAuthBootstrap();
      setUser({
        sub: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role: data.user.role,
      }, token);
      useAuthStore.getState().setInitialized(true);
      router.push('/dashboard');
    },
    [router, setUser],
  );

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthToken(null);
    resetAuthBootstrap();
    clearUser();
    router.push('/login');
  }, [router, clearUser]);

  return { user, role: user?.role, login, logout };
}
