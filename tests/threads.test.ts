import { describe, expect, it } from 'vitest';

import { extractThreadsMetadata } from '../worker/providers/threads';

describe('threads metadata extraction', () => {
  it('extracts post text and author title from public Threads HTML', () => {
    const parsed = extractThreadsMetadata(`
      <html>
        <head>
          <meta property="og:title" content="Mini Little Changes (@mini_littlechanges) on Threads" />
          <meta property="og:description" content="&#x7528;&#x5497; Claude Code &#x5927;&#x534a;&#x5e74;&#xff0c;&#x6211;&#x8a8d;&#x771f;&#x6578;&#x904e;&#xff0c;&#x539f;&#x4f86;&#x6709; 10 &#x5c64;&#x95dc;&#x5361;&#x8981;&#x904e;&#x3002;" />
        </head>
      </html>
    `);

    expect(parsed.title).toBe('Mini Little Changes (@mini_littlechanges)');
    expect(parsed.text).toContain('Claude Code');
    expect(parsed.text).toContain('10 層關卡要過');
  });

  it('rejects generic fallback descriptions', () => {
    const parsed = extractThreadsMetadata(`
      <html>
        <head>
          <meta property="og:title" content="Mini Little Changes (@mini_littlechanges) on Threads" />
          <meta property="og:description" content="See this post on Threads" />
        </head>
      </html>
    `);

    expect(parsed.text).toBeNull();
  });

  it('falls back to JSON-LD post text when og description is generic', () => {
    const parsed = extractThreadsMetadata(`
      <html>
        <head>
          <meta property="og:title" content="Mini Little Changes (@mini_littlechanges) on Threads" />
          <meta property="og:description" content="See this post on Threads" />
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "SocialMediaPosting",
              "headline": "Mini Little Changes",
              "articleBody": "作者分享自己用 Claude Code 運作約半年，最初只停在前幾層。"
            }
          </script>
        </head>
      </html>
    `);

    expect(parsed.title).toBe('Mini Little Changes (@mini_littlechanges)');
    expect(parsed.text).toContain('Claude Code');
  });
});
