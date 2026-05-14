export interface TranslationJob {
  jobId: string;
  sessionId: string;
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  createdAt: string;
  _traceContext?: Record<string, string>;
}

export interface TranslationResult {
  jobId: string;
  sessionId: string;
  targetLanguage: string;
  translatedText?: string;
  status: 'completed' | 'error';
  durationMs: number;
  completedAt: string;
  error?: string;
  _traceContext?: Record<string, string>;
}

export interface JobStatus {
  status: 'queued' | 'processing' | 'completed' | 'error';
  translatedText?: string;
  error?: string;
}

export interface TranslationSession {
  sessionId: string;
  text: string;
  sourceLanguage: string;
  status: 'queued' | 'in_progress' | 'completed';
  jobs: Map<string, JobStatus>;
}

export const SUPPORTED_LANGUAGES = ['es', 'fr', 'de'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export interface TranslateRequest {
  text: string;
  targetLanguages: string[];
}

export interface TranslateResponse {
  sessionId: string;
  status: string;
  jobs: {
    jobId: string;
    targetLanguage: string;
    status: string;
  }[];
}

export interface SessionResponse {
  sessionId: string;
  text: string;
  status: string;
  translations: Record<string, JobStatus>;
}
