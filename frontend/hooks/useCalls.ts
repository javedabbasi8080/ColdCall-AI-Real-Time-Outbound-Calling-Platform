'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { callsApi } from '@/lib/api';
import { useAuthReady } from './useAuthReady';

export function useCalls(params?: Record<string, string | number>, refetchInterval?: number) {
  const ready = useAuthReady();
  return useQuery({
    queryKey: ['calls', params],
    queryFn: async () => (await callsApi.list(params)).data,
    refetchInterval,
    enabled: ready,
  });
}

export function useCall(id: string | null) {
  return useQuery({
    queryKey: ['call', id],
    queryFn: async () => (id ? (await callsApi.get(id)).data : null),
    enabled: !!id,
  });
}

export function useCallTranscript(id: string | null) {
  return useQuery({
    queryKey: ['call-transcript', id],
    queryFn: async () => (id ? (await callsApi.transcript(id)).data : []),
    enabled: !!id,
  });
}

export function useStartCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (leadId: string) => callsApi.start(leadId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calls'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
