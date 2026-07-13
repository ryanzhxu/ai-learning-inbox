import { describe, expect, it } from 'vitest';

import { buildAnalysisInputContent } from '../worker/providers/openai';

describe('analysis prompt', () => {
  it('asks for a prioritized, concrete, verifiable action loop', () => {
    const content = buildAnalysisInputContent({
      platform: 'instagram',
      canonicalUrl: 'https://www.instagram.com/p/example/',
      normalizedText: 'A post claims a new workflow is dramatically faster.',
    });
    const prompt = content[0]?.type === 'input_text' ? content[0].text : '';

    expect(prompt).toContain('highest-value, most practical next step first');
    expect(prompt).toContain('clear artifact or observable result');
    expect(prompt).toContain('roughly 30 to 60 minutes');
    expect(prompt).toContain('optional follow-ups');
    expect(prompt).toContain('verification');
    expect(prompt).toContain('Avoid vague actions');
    expect(prompt).toContain('Return 1 to 3 action_items only');
  });

  it('still supports image-backed analysis input', () => {
    const content = buildAnalysisInputContent({
      platform: 'instagram',
      canonicalUrl: 'https://www.instagram.com/p/example/',
      normalizedText: 'Text from the share sheet.',
      imageUrl: 'data:image/jpeg;base64,abc',
    });

    expect(content).toHaveLength(2);
    expect(content[1]).toMatchObject({ type: 'input_image', detail: 'high' });
  });
});
