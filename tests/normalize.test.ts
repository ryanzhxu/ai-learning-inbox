import { describe, expect, it } from 'vitest';

import { canonicalizeUrl, normalizeForInsert } from '../worker/domain/normalize';

describe('normalize helpers', () => {
  it('canonicalizes tracking params away', () => {
    expect(canonicalizeUrl('https://www.threads.net/@demo/post/abc123?igshid=foo&utm_source=bar&keep=yes')).toBe(
      'https://www.threads.net/@demo/post/abc123?keep=yes',
    );
  });

  it('removes Threads share tracking params', () => {
    expect(canonicalizeUrl('https://www.threads.com/@demo/post/abc123?xmt=token&slof=1&keep=yes')).toBe(
      'https://www.threads.com/@demo/post/abc123?keep=yes',
    );
  });

  it('removes X share tracking params', () => {
    expect(canonicalizeUrl('https://x.com/laoyingkhq/status/2073358018750935254?s=12')).toBe(
      'https://x.com/laoyingkhq/status/2073358018750935254',
    );
  });

  it('builds a normalized post shape from partial share payload', () => {
    const normalized = normalizeForInsert({
      source_platform: 'threads',
      source_url: 'https://www.threads.net/@demo/post/abc123',
      user_note: 'Worth trying in a toy agent workflow.',
    });

    expect(normalized.platform).toBe('threads');
    expect(normalized.externalPostId).toBe('abc123');
    expect(normalized.normalizedText).toContain('Worth trying');
  });

  it('prefers a Threads URL over a mismatched source_platform value', () => {
    const normalized = normalizeForInsert({
      source_platform: 'instagram',
      source_url: 'https://www.threads.com/@demo/post/abc123',
      shared_text: 'https://www.threads.com/@demo/post/abc123',
    });

    expect(normalized.platform).toBe('threads');
  });
});
