export type UserRole = 'admin' | 'manager' | 'agent';

export interface User {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
}

export type LeadStatus =
  | 'pending'
  | 'called'
  | 'interested'
  | 'not_interested'
  | 'callback'
  | 'voicemail'
  | 'failed'
  | 'do_not_call';

export type CallSessionStatus =
  | 'initiated'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'no_answer';

export type CallOutcome =
  | 'interested'
  | 'not_interested'
  | 'callback'
  | 'voicemail'
  | 'hung_up'
  | 'no_answer';

export interface ScriptStep {
  step: number;
  message: string;
  expectedResponses: string[];
  objectionRebuttal: string;
}

export interface VoiceSettings {
  elevenLabsVoiceId?: string;
  stability: number;
  similarityBoost: number;
}

export interface BusinessKnowledge {
  businessName?: string;
  businessDescription?: string;
  industry?: string;
  country?: string;
  city?: string;
  projectName?: string;
  companyIntroduction?: string;
  agentRole?: string;
  agentName?: string;
  agentGender?: string;
  greetingStyle?: string;
  businessTone?: string;
  conversationGoal?: string;
  qualificationStrategy?: string;
  appointmentStrategy?: string;
  salesStrategy?: string;
  closingStrategy?: string;
  primaryLanguage?: string;
  locationLabel?: string;
  propertyTypes?: string[];
  availableSizes?: string[];
  paymentPlans?: string[];
  doNotSayRules?: string[];
  voicePersonality?: string;
  responseLength?: string;
  [key: string]: unknown;
}

export interface CategoryProduct {
  _id: string;
  name: string;
  description: string;
  availableSizes: string[];
  price: string;
  paymentPlan: string;
  status: string;
}

export interface CategoryFaq {
  _id: string;
  question: string;
  answer: string;
  priority: number;
  keywords: string[];
}

export interface ConversationStageRow {
  _id: string;
  key: string;
  stageName: string;
  goal: string;
  instructions: string;
  priority: number;
  forbiddenQuestions: string[];
  nextPossibleStages: string[];
}

export interface KnowledgeBundle {
  categoryId: string;
  categoryName: string;
  knowledge: BusinessKnowledge;
  products: CategoryProduct[];
  faqs: CategoryFaq[];
  objections: Array<{ _id: string; name: string; handlingStrategies: string[] }>;
  stages: ConversationStageRow[];
}

export interface Category {
  _id: string;
  name: string;
  knowledge?: BusinessKnowledge;
  playbook?: { businessName?: string };
  script?: ScriptStep[];
  voiceSettings: VoiceSettings;
  createdAt?: string;
}

export interface Lead {
  _id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  category: Category | string;
  csvBatch?: string;
  status: LeadStatus;
  callAttempts: number;
  lastCalledAt?: string;
  callbackScheduledAt?: string;
  notes: string;
  timezone: string;
  createdAt?: string;
}

export interface CsvBatch {
  _id: string;
  fileName: string;
  totalLeads: number;
  validLeads: number;
  duplicatesSkipped: number;
  categoryId: Category | string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface CallUsageSummary {
  openaiPromptTokens: number;
  openaiCompletionTokens: number;
  openaiTotalTokens: number;
  elevenLabsCharacters: number;
  twilioDurationSeconds: number;
  openaiUsd: number;
  elevenLabsUsd: number;
  twilioUsd: number;
  totalUsd: number;
}

export interface CallSession {
  _id: string;
  leadId: Lead | string;
  categoryId: Category | string;
  twilioCallSid?: string;
  status: CallSessionStatus;
  currentStep: number;
  startedAt: string;
  endedAt?: string;
  durationSeconds: number;
  outcome?: CallOutcome;
  callbackScheduledAt?: string;
  agentNotes: string;
  elevenLabsAudioUrls: string[];
  openaiPromptTokens?: number;
  openaiCompletionTokens?: number;
  elevenLabsCharacters?: number;
  usage?: CallUsageSummary;
}

export type ConversationRole = 'system' | 'lead';

export interface ConversationTurn {
  _id: string;
  callSessionId: string;
  role: ConversationRole;
  message: string;
  audioUrl?: string;
  timestamp: string;
  detectedIntent?: string;
  scriptStep?: number;
  rawTranscript?: string;
}

export type SettingsGroup = 'twilio' | 'elevenlabs' | 'openai' | 'system';

export interface AppSetting {
  key: string;
  label: string;
  group: SettingsGroup;
  maskedValue: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AnalyticsOverview {
  totalLeads: number;
  totalCalled: number;
  interested: number;
  notInterested: number;
  callbacks: number;
  voicemails: number;
  failed: number;
  conversionRate: number;
}

export interface DailyAnalytics {
  _id: string;
  total: number;
  interested: number;
  notInterested: number;
  callbacks: number;
  voicemails: number;
  failed: number;
}

export interface CategoryAnalytics {
  categoryId: string;
  categoryName: string;
  total: number;
  called: number;
  interested: number;
  notInterested: number;
  callbacks: number;
  voicemails: number;
  failed: number;
}

export interface ConversionRateData {
  total: number;
  called: number;
  interested: number;
  scheduled: number;
  calledRate: number;
  interestRate: number;
  scheduleRate: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UploadResult {
  inserted: number;
  duplicates: number;
  invalid: number;
}

export interface CallDetailResponse {
  session: CallSession;
  turns: ConversationTurn[];
}
