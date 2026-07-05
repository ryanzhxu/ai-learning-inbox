import { describe, expect, it } from 'vitest';

import { buildDigestSourceText, fallbackDigestFromAnalyses, validateDigestOutput } from '../worker/domain/digest';

describe('digest helpers', () => {
  it('formats compact digest source text', () => {
    const text = buildDigestSourceText([
      {
        summary: 'Compare agent architectures.',
        why_it_matters: 'Avoid overbuilding too early.',
        action_items: [
          { title: 'Sketch flow', description: 'Draw the one-agent path first.', difficulty: 'easy', estimated_minutes: 20 },
        ],
      },
    ]);

    expect(text).toContain('Post 1');
    expect(text).toContain('Sketch flow');
  });

  it('validates digest output schema', () => {
    const parsed = validateDigestOutput({
      summary: 'Focus on a few experiments.',
      action_items: [
        { title: 'Build one webhook', description: 'Capture a post and store it.', difficulty: 'easy', estimated_minutes: 25 },
      ],
    });

    expect(parsed.action_items).toHaveLength(1);
  });

  it('builds a fallback digest from repeated action items', () => {
    const digest = fallbackDigestFromAnalyses([
      {
        id: 1,
        summary: 'Try a simpler flow first.',
        why_it_matters: 'Fewer moving parts.',
        model_name: 'test',
        prompt_version: 'cf-v1',
        analyzed_at: '2026-07-04T00:00:00.000Z',
        action_items: [
          { id: 1, title: 'Make a toy queue', description: 'Process one post async.', difficulty: 'easy', estimated_minutes: 30, status: 'open', position: 0 },
        ],
      },
    ]);

    expect(digest.summary).toContain('saved 1 AI learning posts');
    expect(digest.action_items[0]?.title).toBe('Make a toy queue');
  });
});
