import { setAuthToken } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import type { User } from '@/types';

let bootstrapPromise: Promise<void> | null = null;

const BOOTSTRAP_TIMEOUT_MS = 10_000;

export function resetAuthBootstrap() {
  bootstrapPromise = null;
}

async function fetchWithTimeout(url: string, timeoutMs = BOOTSTRAP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function runBootstrap() {
  try {
    const tokenRes = await fetchWithTimeout('/api/auth/token');
    if (tokenRes.ok) {
      const { token } = await tokenRes.json();
      if (token) {
        setAuthToken(token);
        const meRes = await fetchWithTimeout('/api/auth/me');
        if (meRes.ok) {
          const data = await meRes.json();
          useAuthStore.getState().setUser(data as User, token);
          return;
        }
      }
    }
    setAuthToken(null);
    useAuthStore.getState().setUser(null, null);
  } catch {
    setAuthToken(null);
    useAuthStore.getState().setUser(null, null);
  } finally {
    useAuthStore.getState().setInitialized(true);
  }
}

export function bootstrapAuth(): Promise<void> {
  const { initialized } = useAuthStore.getState();
  if (initialized) {
    return Promise.resolve();
  }
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = runBootstrap();
  return bootstrapPromise;
}
