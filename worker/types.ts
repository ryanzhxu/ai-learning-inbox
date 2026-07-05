export interface Env {
  DB: D1Database;
  ANALYSIS_QUEUE: Queue<SubmissionJob>;
  OPENAI_API_KEY: string;
  AILI_WEBHOOK_SECRET: string;
  OPENAI_MODEL?: string;
  APP_ENV?: string;
}

export interface IngestPayload {
  source_platform: string;
  source_url: string;
  shared_text?: string;
  user_note?: string;
  capture_method?: string;
  shared_at?: string;
}

export interface SubmissionJob {
  submissionId: number;
}

export interface ActionItemInput {
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  estimated_minutes: number;
}

export interface AnalysisOutput {
  summary: string;
  why_it_matters: string;
  action_items: ActionItemInput[];
}

export interface DigestOutput {
  summary: string;
  action_items: ActionItemInput[];
}

export interface SubmissionCandidate {
  raw_submission_id: number;
  post_id: number;
  source_platform: string;
  source_url: string;
  shared_text: string | null;
  user_note: string | null;
  capture_method: string;
  shared_at: string | null;
  canonical_url: string;
  normalized_text: string;
  title: string | null;
}

export interface PostListItem {
  id: number;
  platform: string;
  canonical_url: string;
  title: string | null;
  normalized_text: string;
  normalized_at: string;
  analysis: AnalysisView | null;
}

export interface AnalysisView {
  id: number;
  summary: string;
  why_it_matters: string;
  model_name: string;
  prompt_version: string;
  analyzed_at: string;
  action_items: ActionItemView[];
}

export interface ActionItemView {
  id: number;
  title: string;
  description: string;
  difficulty: ActionItemInput['difficulty'];
  estimated_minutes: number;
  status: string;
  position: number;
}

export interface DigestView {
  id: number;
  summary: string;
  coverage_count: number;
  model_name: string;
  created_at: string;
  action_items: ActionItemInput[];
}

export interface DashboardStats {
  pending: number;
  processed: number;
  failed: number;
  total_posts: number;
}
