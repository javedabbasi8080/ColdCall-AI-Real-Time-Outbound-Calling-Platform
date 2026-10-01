'use client';

import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/lib/api';
import { useAuthReady } from './useAuthReady';

export function useAnalyticsOverview() {
  const ready = useAuthReady();
  return useQuery({
    queryKey: ['analytics-overview'],
    queryFn: async () => (await analyticsApi.overview()).data,
    enabled: ready,
  });
}

export function useDailyAnalytics(startDate?: string, endDate?: string) {
  const ready = useAuthReady();
  return useQuery({
    queryKey: ['analytics-daily', startDate, endDate],
    queryFn: async () => (await analyticsApi.daily(startDate, endDate)).data,
    enabled: ready,
  });
}

export function useCategoryAnalytics() {
  return useQuery({
    queryKey: ['analytics-category'],
    queryFn: async () => (await analyticsApi.byCategory()).data,
  });
}

export function useConversionRate(categoryId?: string, batchId?: string) {
  return useQuery({
    queryKey: ['analytics-conversion', categoryId, batchId],
    queryFn: async () => (await analyticsApi.conversionRate(categoryId, batchId)).data,
  });
}
