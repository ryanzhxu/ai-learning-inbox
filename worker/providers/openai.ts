import OpenAI from 'openai';

import { analysisOutputSchema, digestOutputSchema } from '../domain/schemas';
import { buildDigestSourceText, type DigestSource } from '../domain/digest';
import type { AnalysisOutput, DigestOutput, Env } from '../types';

const ANALYSIS_PROMPT_VERSION = 'cf-v1';

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

export async function analyzePost(env: Env, input: {
  platform: string;
  canonicalUrl: string;
  normalizedText: string;
}): Promise<{ modelName: string; promptVersion: string; result: AnalysisOutput; rawJson: string }> {
  const client = getClient(env);
  const model = env.OPENAI_MODEL || 'gpt-4.1-mini';
  const response = await client.responses.create({
    model,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'You analyze saved AI learning posts. Return JSON only. Be concise, practical, and action-oriented. Only return summary, why_it_matters, and action_items. Avoid hype and avoid extra keys. Return 1 to 3 action_items only.',
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Platform: ${input.platform}\nURL: ${input.canonicalUrl}\n\nSaved text:\n${input.normalizedText}\n\nReturn JSON with this exact shape:\n{\n  "summary": string,\n  "why_it_matters": string,\n  "action_items": [\n    {\n      "title": string,\n      "description": string,\n      "difficulty": "easy" | "medium" | "hard",\n      "estimated_minutes": number\n    }\n  ]\n}\n\nRules:\n- Return 1 to 3 action_items only.\n- If you have more than 3 ideas, keep only the 3 most useful and concrete ones.\n- estimated_minutes must be an integer between 5 and 240.`,
          },
        ],
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
  const model = env.OPENAI_MODEL || 'gpt-4.1-mini';
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
