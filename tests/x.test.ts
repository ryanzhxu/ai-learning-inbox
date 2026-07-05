import { describe, expect, it } from 'vitest';

import { extractXMetadata } from '../worker/providers/x';

describe('x metadata extraction', () => {
  it('extracts tweet text and cleans the title from public X HTML', () => {
    const parsed = extractXMetadata(`
      <html>
        <head>
          <meta property="og:title" content="laoyingkhq on X" />
          <meta property="og:description" content="A short public post about shipping a small agent workflow." />
        </head>
      </html>
    `);

    expect(parsed.title).toBe('laoyingkhq');
    expect(parsed.text).toBe('A short public post about shipping a small agent workflow.');
  });

  it('falls back to structured text when the meta description is generic', () => {
    const parsed = extractXMetadata(`
      <html>
        <head>
          <meta property="og:title" content="laoyingkhq on X" />
          <meta property="og:description" content="See this post on X" />
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "SocialMediaPosting",
              "articleBody": "A structured fallback tweet body with enough detail to analyze."
            }
          </script>
        </head>
      </html>
    `);

    expect(parsed.title).toBe('laoyingkhq');
    expect(parsed.text).toContain('structured fallback tweet body');
  });
});
