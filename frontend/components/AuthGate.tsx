'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { bootstrapAuth } from '@/lib/auth-session';
import { useAuthStore } from '@/stores/useAuthStore';
import { Skeleton } from '@/components/ui/skeleton';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const initialized = useAuthStore((s) => s.initialized);
  const token = useAuthStore((s) => s.token);
  const redirected = useRef(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (initialized) return;
    void bootstrapAuth();
    const timer = setTimeout(() => {
      setTimedOut(true);
      void bootstrapAuth();
    }, 10_000);
    return () => clearTimeout(timer);
  }, [initialized]);

  useEffect(() => {
    if (!initialized && !timedOut) return;
    if (token) return;
    if (redirected.current) return;
    redirected.current = true;
    fetch('/api/auth/logout', { method: 'POST' })
      .catch(() => undefined)
      .finally(() => router.replace('/login'));
  }, [initialized, timedOut, token, router]);

  if (!initialized && !timedOut) {
    return (
      <div className="flex min-h-screen items-center justify-center pl-60">
        <div className="space-y-3 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <p className="text-sm text-muted-foreground text-center">Loading session...</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center pl-60">
        <p className="text-sm text-muted-foreground">Redirecting to login...</p>
      </div>
    );
  }

  return <>{children}</>;
}
