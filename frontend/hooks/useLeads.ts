'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsApi } from '@/lib/api';

export function useLeads(params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['leads', params],
    queryFn: async () => (await leadsApi.list(params)).data,
  });
}

export function useLeadBatches() {
  return useQuery({
    queryKey: ['lead-batches'],
    queryFn: async () => (await leadsApi.batches()).data,
  });
}

export function useUpdateLeadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      leadsApi.updateStatus(id, { status, notes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leadsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useUploadLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      categoryId,
      columnMapping,
    }: {
      file: File;
      categoryId: string;
      columnMapping?: Record<string, string>;
    }) => leadsApi.upload(file, categoryId, columnMapping),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead-batches'] });
    },
  });
}
