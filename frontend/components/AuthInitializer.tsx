'use client';

import { useEffect } from 'react';
import { bootstrapAuth } from '@/lib/auth-session';
import { useAuthStore } from '@/stores/useAuthStore';

export function AuthInitializer() {
  const initialized = useAuthStore((s) => s.initialized);

  useEffect(() => {
    if (initialized) return;
    void bootstrapAuth();
  }, [initialized]);

  return null;
}
