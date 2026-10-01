'use client';

import { useAuthStore } from '@/stores/useAuthStore';

/** Returns true once a bearer token is ready — use to gate API queries */
export function useAuthReady() {
  const initialized = useAuthStore((s) => s.initialized);
  const token = useAuthStore((s) => s.token);
  return initialized && !!token;
}
