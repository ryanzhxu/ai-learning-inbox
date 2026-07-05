import type { ActionItemInput, AnalysisView, DigestOutput } from '../types';
import { digestOutputSchema } from './schemas';

export interface DigestSource {
  summary: string;
  why_it_matters: string;
  action_items: ActionItemInput[];
}

export function buildDigestSourceText(items: DigestSource[]): string {
  return items
    .map((item, index) => {
      const actions = item.action_items
        .map((action) => `- ${action.title} (${action.difficulty}, ${action.estimated_minutes}m): ${action.description}`)
        .join('\n');
      return `Post ${index + 1}\nSummary: ${item.summary}\nWhy it matters: ${item.why_it_matters}\nActions:\n${actions}`;
    })
    .join('\n\n');
}

export function validateDigestOutput(payload: unknown): DigestOutput {
  return digestOutputSchema.parse(payload);
}

export function fallbackDigestFromAnalyses(analyses: AnalysisView[]): DigestOutput {
  const unique = new Map<string, ActionItemInput>();
  for (const analysis of analyses) {
    for (const item of analysis.action_items) {
      if (!unique.has(item.title)) {
        unique.set(item.title, {
          title: item.title,
          description: item.description,
          difficulty: item.difficulty as ActionItemInput['difficulty'],
          estimated_minutes: item.estimated_minutes,
        });
      }
    }
  }

  const summary = analyses.length === 0
    ? 'No analyzed posts yet.'
    : `You saved ${analyses.length} AI learning posts recently. Review the repeated ideas and focus on the next few experiments instead of trying everything at once.`;

  return {
    summary,
    action_items: Array.from(unique.values()).slice(0, 5),
  };
}
