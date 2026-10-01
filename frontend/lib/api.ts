import axios, { AxiosError } from 'axios';
import { useAuthStore } from '@/stores/useAuthStore';
import type {
  AnalyticsOverview,
  AppSetting,
  AuthResponse,
  CallDetailResponse,
  CallSession,
  Category,
  CategoryAnalytics,
  ConversionRateData,
  CsvBatch,
  DailyAnalytics,
  KnowledgeBundle,
  Lead,
  PaginatedResponse,
  SettingsGroup,
  UploadResult,
  User,
  ConversationTurn,
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
  useAuthStore.setState({ token });
}

let handling401 = false;

async function handleUnauthorized() {
  if (handling401 || typeof window === 'undefined') return;
  const { initialized } = useAuthStore.getState();
  const path = window.location.pathname;
  if (!initialized || path.startsWith('/login') || path.startsWith('/register')) return;

  handling401 = true;
  setAuthToken(null);
  const { resetAuthBootstrap } = await import('@/lib/auth-session');
  resetAuthBootstrap();
  useAuthStore.getState().clearUser();
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // ignore
  }
  window.location.replace('/login');
}

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      void handleUnauthorized();
    }
    return Promise.reject(error);
  },
);

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),
  register: (data: { email: string; password: string; name: string; role: string }) =>
    api.post('/auth/register', data),
  me: () => api.get<User>('/auth/me'),
};

// Settings
export const settingsApi = {
  list: () => api.get<AppSetting[]>('/settings'),
  upsert: (key: string, data: { value: string; label: string; group: string }) =>
    api.put(`/settings/${key}`, data),
  test: (group: SettingsGroup) =>
    api.post<{ success: boolean; message: string }>(`/settings/test/${group}`),
};

// Categories
export const categoriesApi = {
  list: () => api.get<Category[]>('/categories'),
  get: (id: string) => api.get<Category>(`/categories/${id}`),
  create: (data: Partial<Category>) => api.post<Category>('/categories', data),
  update: (id: string, data: Partial<Category>) => api.put<Category>(`/categories/${id}`, data),
  delete: (id: string) => api.delete(`/categories/${id}`),
};

// Knowledge base (products, FAQs, stages, business)
export const knowledgeApi = {
  bundle: (categoryId: string) =>
    api.get<KnowledgeBundle>(`/knowledge/categories/${categoryId}/bundle`),
  updateBusiness: (categoryId: string, data: Record<string, unknown>) =>
    api.put(`/knowledge/categories/${categoryId}/business`, data),
  listProducts: (categoryId: string) =>
    api.get(`/knowledge/categories/${categoryId}/products`),
  createProduct: (categoryId: string, data: Record<string, unknown>) =>
    api.post(`/knowledge/categories/${categoryId}/products`, data),
  updateProduct: (id: string, data: Record<string, unknown>) =>
    api.put(`/knowledge/products/${id}`, data),
  deleteProduct: (id: string) => api.delete(`/knowledge/products/${id}`),
  listFaqs: (categoryId: string) =>
    api.get(`/knowledge/categories/${categoryId}/faqs`),
  createFaq: (categoryId: string, data: Record<string, unknown>) =>
    api.post(`/knowledge/categories/${categoryId}/faqs`, data),
  deleteFaq: (id: string) => api.delete(`/knowledge/faqs/${id}`),
  listStages: (categoryId: string) =>
    api.get(`/knowledge/categories/${categoryId}/stages`),
  updateStage: (id: string, data: Record<string, unknown>) =>
    api.put(`/knowledge/stages/${id}`, data),
  invalidate: (categoryId: string) =>
    api.post(`/knowledge/cache/invalidate/${categoryId}`),
};

// Leads
export const leadsApi = {
  list: (params?: Record<string, string | number>) =>
    api.get<PaginatedResponse<Lead>>('/leads', { params }),
  get: (id: string) => api.get(`/leads/${id}`),
  updateStatus: (id: string, data: { status: string; notes?: string }) =>
    api.patch(`/leads/${id}/status`, data),
  delete: (id: string) => api.delete(`/leads/${id}`),
  upload: (file: File, categoryId: string, columnMapping?: Record<string, string>) => {
    const form = new FormData();
    form.append('file', file);
    form.append('categoryId', categoryId);
    if (columnMapping && Object.keys(columnMapping).length > 0) {
      form.append('columnMapping', JSON.stringify(columnMapping));
    }
    return api.post<UploadResult>('/leads/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  batches: () => api.get<CsvBatch[]>('/leads/batches'),
};

// Calls
export const callsApi = {
  list: (params?: Record<string, string | number>) =>
    api.get<PaginatedResponse<CallSession>>('/calls', { params }),
  get: (id: string) => api.get<CallDetailResponse>(`/calls/${id}`),
  transcript: (id: string) => api.get<ConversationTurn[]>(`/calls/${id}/transcript`),
  audio: (id: string) => api.get(`/calls/${id}/audio`),
  start: (leadId: string) => api.post(`/calls/start/${leadId}`),
};

// Voice Lab (isolated ElevenLabs voice tester)
export interface VoiceLabVoice {
  voiceId: string;
  name: string;
  category?: string;
  previewUrl?: string;
  labels?: Record<string, string>;
}

export interface VoiceLabModel {
  modelId: string;
  name: string;
  languages?: string[];
}

export interface SynthesizeResponse {
  mime: string;
  chars: number;
  bytes: number;
  audioBase64: string;
}

export interface SynthesizePayload {
  text: string;
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
  useSpeakerBoost?: boolean;
}

export const voiceLabApi = {
  voices: () => api.get<VoiceLabVoice[]>('/voice-lab/voices'),
  models: () => api.get<VoiceLabModel[]>('/voice-lab/models'),
  synthesize: (payload: SynthesizePayload) =>
    api.post<SynthesizeResponse>('/voice-lab/synthesize', payload),
};

// Analytics
export const analyticsApi = {
  overview: () => api.get<AnalyticsOverview>('/analytics/overview'),
  daily: (startDate?: string, endDate?: string) =>
    api.get<DailyAnalytics[]>('/analytics/daily', { params: { startDate, endDate } }),
  byCategory: () => api.get<CategoryAnalytics[]>('/analytics/by-category'),
  conversionRate: (categoryId?: string, batchId?: string) =>
    api.get<ConversionRateData>('/analytics/conversion-rate', {
      params: { categoryId, batchId },
    }),
};
