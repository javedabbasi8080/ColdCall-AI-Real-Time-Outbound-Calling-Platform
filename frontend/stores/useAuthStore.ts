import { create } from 'zustand';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  token: string | null;
  initialized: boolean;
  setUser: (user: User | null, token?: string | null) => void;
  clearUser: () => void;
  setInitialized: (initialized: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  initialized: false,
  setUser: (user, token = null) => set({ user, token }),
  clearUser: () => {
    set({ user: null, token: null, initialized: false });
    void import('@/lib/auth-session').then((m) => m.resetAuthBootstrap());
  },
  setInitialized: (initialized) => set({ initialized }),
}));
