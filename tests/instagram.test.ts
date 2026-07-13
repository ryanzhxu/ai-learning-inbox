import { afterEach, describe, expect, it, vi } from 'vitest';

import { extractInstagramMetadata, fetchInstagramImageAsDataUrl } from '../worker/providers/instagram';
import { buildAnalysisInputContent } from '../worker/providers/openai';

describe('instagram metadata extraction', () => {
  it('extracts caption text, title, and image url from public Instagram HTML', () => {
    const parsed = extractInstagramMetadata(`
      <html>
        <head>
          <meta property="og:title" content="Mini Little Changes on Instagram" />
          <meta property="og:description" content="&#x7528;&#x5497; Claude Code &#x5927;&#x534a;&#x5e74;&#xff0c;&#x6211;&#x8a8d;&#x771f;&#x6578;&#x904e;&#xff0c;&#x539f;&#x4f86;&#x6709; 10 &#x5c64;&#x95dc;&#x5361;&#x8981;&#x904e;&#x3002;" />
          <meta property="og:image" content="https://cdn.example.com/instagram-post.jpg" />
        </head>
      </html>
    `);

    expect(parsed.title).toBe('Mini Little Changes');
    expect(parsed.text).toContain('Claude Code');
    expect(parsed.imageUrl).toBe('https://cdn.example.com/instagram-post.jpg');
  });

  it('falls back to structured text when the meta description is generic', () => {
    const parsed = extractInstagramMetadata(`
      <html>
        <head>
          <meta property="og:title" content="Mini Little Changes on Instagram" />
          <meta property="og:description" content="See this post on Instagram" />
          <meta property="og:image:secure_url" content="https://cdn.example.com/instagram-post-2.jpg" />
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "SocialMediaPosting",
              "caption": "作者分享自己用 Claude Code 運作約半年，最初只停在前幾層。"
            }
          </script>
        </head>
      </html>
    `);

    expect(parsed.title).toBe('Mini Little Changes');
    expect(parsed.text).toContain('Claude Code');
    expect(parsed.imageUrl).toBe('https://cdn.example.com/instagram-post-2.jpg');
  });

  it('falls back to structured image urls when meta tags do not expose one', () => {
    const parsed = extractInstagramMetadata(`
      <html>
        <head>
          <meta property="og:title" content="Mini Little Changes on Instagram" />
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "SocialMediaPosting",
              "caption": "作者分享自己用 Claude Code 運作約半年。",
              "image": "https://cdn.example.com/instagram-jsonld.jpg"
            }
          </script>
        </head>
      </html>
    `);

    expect(parsed.text).toContain('Claude Code');
    expect(parsed.imageUrl).toBe('https://cdn.example.com/instagram-jsonld.jpg');
  });
});

describe('analysis input content', () => {
  it('adds an image part for vision-based analysis when an image url is present', () => {
    const content = buildAnalysisInputContent({
      platform: 'instagram',
      canonicalUrl: 'https://www.instagram.com/p/abc123/',
      normalizedText: 'Saved caption text',
      imageUrl: 'https://cdn.example.com/post.jpg',
    });

    expect(content).toHaveLength(2);
    expect(content[1]).toMatchObject({
      type: 'input_image',
      image_url: 'https://cdn.example.com/post.jpg',
      detail: 'low',
    });
  });
});

describe('instagram image fetching', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('inlines image bytes as a data url when the fetch succeeds', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'content-type': 'image/png' },
      status: 200,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchInstagramImageAsDataUrl('https://cdn.example.com/post.png');

    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/post.png', expect.any(Object));
    expect(result.status).toBe('downloaded');
    expect(result.dataUrl?.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('does not send the original url when the fetch is not an image', async () => {
    const fetchMock = vi.fn(async () => new Response('<html></html>', {
      headers: { 'content-type': 'text/html' },
      status: 200,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchInstagramImageAsDataUrl('https://cdn.example.com/post.png');

    expect(result).toEqual({ dataUrl: null, status: 'invalid_content' });
  });

  it('records a download failure when the image url is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })));

    const result = await fetchInstagramImageAsDataUrl('https://cdn.example.com/post.png');

    expect(result).toEqual({ dataUrl: null, status: 'download_failed' });
  });

  it('does not inline an image larger than the configured limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(8 * 1024 * 1024 + 1), {
      headers: { 'content-type': 'image/png' },
      status: 200,
    })));

    const result = await fetchInstagramImageAsDataUrl('https://cdn.example.com/post.png');

    expect(result).toEqual({ dataUrl: null, status: 'too_large' });
  });
});
