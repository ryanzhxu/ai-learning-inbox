import OpenAI from 'openai';

import { analysisOutputSchema, digestOutputSchema } from '../domain/schemas';
import { buildDigestSourceText, type DigestSource } from '../domain/digest';
import type { AnalysisOutput, DigestOutput, Env } from '../types';

const ANALYSIS_PROMPT_VERSION = 'cf-v2';
const DEFAULT_OPENAI_MODEL = 'gpt-5.4-nano';

function getClient(env: Env): OpenAI {
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

function extractJson(text: string): unknown {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('OpenAI response did not include JSON');
  }
  return JSON.parse(text.slice(firstBrace, lastBrace + 1));
}

function normalizeActionItems(items: unknown, maxItems: number): unknown {
  if (!Array.isArray(items)) {
    return items;
  }

  return items.slice(0, maxItems).map((item) => {
    if (!item || typeof item !== 'object') {
      return item;
    }

    const candidate = item as { estimated_minutes?: unknown };
    if (typeof candidate.estimated_minutes !== 'number' || Number.isNaN(candidate.estimated_minutes)) {
      return item;
    }

    return {
      ...candidate,
      estimated_minutes: Math.max(5, Math.min(240, Math.round(candidate.estimated_minutes))),
    };
  });
}

function normalizeGeneratedPayload(payload: unknown, maxItems: number): unknown {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const candidate = payload as { action_items?: unknown };
  if (!Array.isArray(candidate.action_items)) {
    return payload;
  }

  return {
    ...candidate,
    action_items: normalizeActionItems(candidate.action_items, maxItems),
  };
}

export function normalizeAnalysisPayload(payload: unknown): unknown {
  return normalizeGeneratedPayload(payload, 3);
}

export function buildAnalysisInputContent(input: {
  platform: string;
  canonicalUrl: string;
  normalizedText: string;
  imageUrl?: string | null;
}): Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'low' | 'high' | 'auto' }> {
  const imageInstruction = input.imageUrl?.trim()
    ? '\n\nIf an image is attached, read it closely, transcribe any visible text you can see, and combine it with the saved text.'
    : '';
  const actionRules = [
    '- Return 1 to 3 action_items only.',
    '- Put the highest-value, most practical next step first.',
    '- Make the first action a concrete experiment or task with a clear artifact or observable result.',
    '- Prefer a first action that can be completed in roughly 30 to 60 minutes; use a shorter estimate when that is enough.',
    '- Make later actions optional follow-ups, not a list of broad projects.',
    '- If a claim is uncertain, hype-prone, or needs evidence, make verification a concrete action instead of repeating the claim as fact.',
    '- Avoid vague actions such as "build a system", "create a plan", or "learn more" unless you specify the smallest next step and its completion criteria.',
    '- estimated_minutes must be an integer between 5 and 240.',
  ].join('\n');
  const content: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'low' | 'high' | 'auto' }> = [
    {
      type: 'input_text',
      text: `Platform: ${input.platform ?? 'unknown'}\nURL: ${input.canonicalUrl ?? ''}\n\nSaved text:\n${input.normalizedText}${imageInstruction}\n\nReturn JSON with this exact shape:\n{\n  "summary": string,\n  "why_it_matters": string,\n  "action_items": [\n    {\n      "title": string,\n      "description": string,\n      "difficulty": "easy" | "medium" | "hard",\n      "estimated_minutes": number\n    }\n  ]\n}\n\nRules:\n${actionRules}`,
    },
  ];

  if (input.imageUrl?.trim()) {
    content.push({
      type: 'input_image',
      image_url: input.imageUrl.trim(),
      detail: 'high',
    });
  }

  return content;
}

export async function analyzePost(env: Env, input: {
  platform: string;
  canonicalUrl: string;
  normalizedText: string;
  imageUrl?: string | null;
}): Promise<{ modelName: string; promptVersion: string; result: AnalysisOutput; rawJson: string }> {
  const client = getClient(env);
  const model = env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  const response = await client.responses.create({
    model,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'You analyze saved AI learning posts. Return JSON only. Be concise, practical, and action-oriented. Only return summary, why_it_matters, and action_items. Avoid hype and avoid extra keys. Return 1 to 3 action_items only. The first action must be the highest-value concrete next step, with a bounded scope and a verifiable outcome. Later actions are optional follow-ups. If a claim is uncertain or hype-prone, prefer a verification action.',
          },
        ],
      },
      {
        role: 'user',
        content: buildAnalysisInputContent(input),
      },
    ],
  });

  const rawText = response.output_text ?? '';
  const parsed = analysisOutputSchema.parse(normalizeAnalysisPayload(extractJson(rawText)));
  return {
    modelName: model,
    promptVersion: ANALYSIS_PROMPT_VERSION,
    result: parsed,
    rawJson: JSON.stringify(parsed),
  };
}

export async function buildDigest(env: Env, items: DigestSource[]): Promise<{ modelName: string; result: DigestOutput; rawJson: string }> {
  const client = getClient(env);
  const model = env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  const response = await client.responses.create({
    model,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'You create a short AI learning digest from saved post analyses. Return JSON only. Keep it practical and prioritize a few actions, not many.',
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Build a compact digest from these analyzed posts:\n\n${buildDigestSourceText(items)}\n\nReturn JSON with this exact shape:\n{\n  "summary": string,\n  "action_items": [\n    {\n      "title": string,\n      "description": string,\n      "difficulty": "easy" | "medium" | "hard",\n      "estimated_minutes": number\n    }\n  ]\n}\n\nRules:\n- Return between 1 and 5 action_items.\n- estimated_minutes must be an integer between 5 and 240.`,
          },
        ],
      },
    ],
  });

  const rawText = response.output_text ?? '';
  const parsed = digestOutputSchema.parse(normalizeGeneratedPayload(extractJson(rawText), 5));
  return {
    modelName: model,
    result: parsed,
    rawJson: JSON.stringify(parsed),
  };
}
