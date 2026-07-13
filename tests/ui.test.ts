import { describe, expect, it } from 'vitest';

import { renderPostDetail } from '../worker/ui/render';
import type { PostListItem } from '../worker/types';

const post: PostListItem = {
  id: 7,
  platform: 'instagram',
  canonical_url: 'https://www.instagram.com/p/example/',
  title: 'A useful experiment',
  normalized_text: 'Saved source text',
  normalized_at: '2026-07-12T18:00:00.000Z',
  analysis: {
    id: 11,
    summary: 'A concise summary.',
    why_it_matters: 'It may be worth testing.',
    model_name: 'test-model',
    prompt_version: 'cf-v2',
    analyzed_at: '2026-07-12T18:00:00.000Z',
    action_items: [
      {
        id: 1,
        title: 'Run the first experiment',
        description: 'Create one small artifact and compare the result.',
        difficulty: 'easy',
        estimated_minutes: 45,
        status: 'planned',
        status_updated_at: '2026-07-12T18:05:00.000Z',
        position: 0,
      },
      {
        id: 2,
        title: '<Review later>',
        description: 'Optional follow-up.',
        difficulty: 'easy',
        estimated_minutes: 15,
        status: 'open',
        status_updated_at: null,
        position: 1,
      },
    ],
  },
};

describe('action item rendering', () => {
  it('shows status labels and prioritizes the first action without mutation controls', () => {
    const html = renderPostDetail(post);

    expect(html).toContain('Planned');
    expect(html).toContain('Open');
    expect(html).toContain('action-item-primary');
    expect(html).not.toContain('action-items/1/status');
    expect(html).not.toContain('x-aili-secret');
  });

  it('escapes action titles and descriptions', () => {
    const html = renderPostDetail(post);

    expect(html).toContain('&lt;Review later&gt;');
    expect(html).not.toContain('<Review later>');
  });
});
