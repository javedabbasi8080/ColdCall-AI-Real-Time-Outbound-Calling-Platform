import { create } from 'zustand';
import type { CallSession } from '@/types';

interface CallState {
  activeCalls: CallSession[];
  setActiveCalls: (calls: CallSession[]) => void;
}

export const useCallStore = create<CallState>((set) => ({
  activeCalls: [],
  setActiveCalls: (calls) => set({ activeCalls: calls }),
}));
