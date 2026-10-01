'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/lib/api';
import type { SettingsGroup } from '@/types';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await settingsApi.list()).data,
  });
}

export function useUpsertSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value, label, group }: { key: string; value: string; label: string; group: string }) =>
      settingsApi.upsert(key, { value, label, group }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}

export function useTestSetting() {
  return useMutation({
    mutationFn: (group: SettingsGroup) => settingsApi.test(group),
  });
}
