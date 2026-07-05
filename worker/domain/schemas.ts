import { z } from 'zod';

export const ingestPayloadSchema = z.object({
  source_platform: z.string().trim().min(1).max(50),
  source_url: z.string().url(),
  shared_text: z.string().trim().min(1).optional(),
  user_note: z.string().trim().min(1).optional(),
  capture_method: z.string().trim().min(1).max(50).optional(),
  shared_at: z.string().datetime({ offset: true }).optional(),
});

export const actionItemSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(600),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  estimated_minutes: z.number().int().min(5).max(240),
});

export const analysisOutputSchema = z.object({
  summary: z.string().trim().min(1).max(600),
  why_it_matters: z.string().trim().min(1).max(600),
  action_items: z.array(actionItemSchema).min(1).max(3),
});

export const digestOutputSchema = z.object({
  summary: z.string().trim().min(1).max(800),
  action_items: z.array(actionItemSchema).min(1).max(5),
});
