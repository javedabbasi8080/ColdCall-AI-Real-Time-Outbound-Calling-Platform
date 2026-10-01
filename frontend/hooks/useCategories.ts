'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoriesApi } from '@/lib/api';
import type { Category } from '@/types';

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await categoriesApi.list()).data,
  });
}

export function useCategory(id: string | null) {
  return useQuery({
    queryKey: ['category', id],
    queryFn: async () => (id ? (await categoriesApi.get(id)).data : null),
    enabled: !!id,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Category>) => categoriesApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Category> }) =>
      categoriesApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => categoriesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}
