const THREADS_DESCRIPTION_FALLBACKS = [
  'see this thread',
  'see this post',
  'on threads',
];

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (entity, token: string) => {
    const lowered = token.toLowerCase();
    if (lowered === 'amp') return '&';
    if (lowered === 'lt') return '<';
    if (lowered === 'gt') return '>';
    if (lowered === 'quot') return '"';
    if (lowered === 'apos' || lowered === '#39') return '\'';
    if (lowered.startsWith('#x')) {
      const codePoint = Number.parseInt(lowered.slice(2), 16);
      return Number.isNaN(codePoint) ? entity : String.fromCodePoint(codePoint);
    }
    if (lowered.startsWith('#')) {
      const codePoint = Number.parseInt(lowered.slice(1), 10);
      return Number.isNaN(codePoint) ? entity : String.fromCodePoint(codePoint);
    }
    return entity;
  });
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractMetaContent(html: string, key: string): string | null {
  const metaPattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=(["'])([\\s\\S]*?)\\1[^>]*>`,
    'i',
  );
  const match = html.match(metaPattern);
  return match?.[2] ?? null;
}

function cleanThreadsTitle(title: string | null): string | null {
  if (!title) return null;
  const cleaned = normalizeWhitespace(decodeHtmlEntities(title))
    .replace(/\s+on Threads$/i, '')
    .trim();
  return cleaned || null;
}

function isUsefulDescription(description: string): boolean {
  const normalized = description.trim();
  if (normalized.length < 20) {
    return false;
  }

  const lowered = normalized.toLowerCase();
  return !THREADS_DESCRIPTION_FALLBACKS.some((phrase) => lowered === phrase || lowered.startsWith(`${phrase} `));
}

export function extractThreadsMetadata(html: string): { title: string | null; text: string | null } {
  const title = cleanThreadsTitle(
    extractMetaContent(html, 'og:title')
    ?? extractMetaContent(html, 'twitter:title'),
  );

  const rawDescription = extractMetaContent(html, 'og:description')
    ?? extractMetaContent(html, 'twitter:description')
    ?? extractMetaContent(html, 'description');

  const description = rawDescription ? normalizeWhitespace(decodeHtmlEntities(rawDescription)) : null;

  return {
    title,
    text: description && isUsefulDescription(description) ? description : null,
  };
}

export async function fetchThreadsMetadata(url: string): Promise<{ title: string | null; text: string | null }> {
  const response = await fetch(url, {
    headers: {
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': 'Mozilla/5.0 (compatible; AI-Learning-Inbox/1.0; +https://ai-learning-inbox.rxlab.workers.dev)',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Threads fetch failed with status ${response.status}`);
  }

  const html = await response.text();
  return extractThreadsMetadata(html);
}
