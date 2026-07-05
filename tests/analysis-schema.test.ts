import { describe, expect, it } from 'vitest';

import { analysisOutputSchema } from '../worker/domain/schemas';
import { normalizeAnalysisPayload } from '../worker/providers/openai';

describe('analysis output schema', () => {
  it('accepts the minimal three-field contract', () => {
    const parsed = analysisOutputSchema.parse({
      summary: 'This post suggests starting with a single async worker.',
      why_it_matters: 'It keeps the first version cheap and easier to debug.',
      action_items: [
        {
          title: 'Create one queue consumer',
          description: 'Process one saved post end to end with a single worker.',
          difficulty: 'medium',
          estimated_minutes: 45,
        },
      ],
    });

    expect(parsed.action_items[0].estimated_minutes).toBe(45);
  });

  it('trims extra action items before schema validation', () => {
    const parsed = analysisOutputSchema.parse(
      normalizeAnalysisPayload({
        summary: 'Use a small worker first.',
        why_it_matters: 'It lowers complexity while preserving learning value.',
        action_items: [
          {
            title: 'Build one worker',
            description: 'Create one background worker that processes a saved post.',
            difficulty: 'medium',
            estimated_minutes: 45,
          },
          {
            title: 'Add one retry path',
            description: 'Handle one retry path for failed analyses.',
            difficulty: 'easy',
            estimated_minutes: 20,
          },
          {
            title: 'Review one digest',
            description: 'Check whether the digest is actually actionable.',
            difficulty: 'easy',
            estimated_minutes: 15,
          },
          {
            title: 'Ignore this extra item',
            description: 'This should be dropped by the hard cap.',
            difficulty: 'easy',
            estimated_minutes: 10,
          },
        ],
      }),
    );

    expect(parsed.action_items).toHaveLength(3);
    expect(parsed.action_items[2].title).toBe('Review one digest');
  });

  it('clamps estimated minutes into the allowed range', () => {
    const parsed = analysisOutputSchema.parse(
      normalizeAnalysisPayload({
        summary: 'Small experiments are easier to finish.',
        why_it_matters: 'The best next step is the one you can actually complete.',
        action_items: [
          {
            title: 'Try a tiny prototype',
            description: 'Build one narrow version before scaling the design.',
            difficulty: 'easy',
            estimated_minutes: 3.2,
          },
        ],
      }),
    );

    expect(parsed.action_items[0].estimated_minutes).toBe(5);
  });
});
