const INSTAGRAM_DESCRIPTION_FALLBACKS = [
  'see this post on instagram',
  'view this post on instagram',
  'log in to see photos and videos from friends',
];

const INSTAGRAM_TEXT_KEYS = ['articleBody', 'caption', 'description', 'headline', 'text', 'name'] as const;

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

function cleanInstagramTitle(title: string | null): string | null {
  if (!title) return null;
  const cleaned = normalizeWhitespace(decodeHtmlEntities(title))
    .replace(/\s+\|\s+Instagram$/i, '')
    .replace(/\s+-\s+Instagram Photos and Videos$/i, '')
    .replace(/\s+on Instagram$/i, '')
    .trim();
  return cleaned || null;
}

function isUsefulDescription(description: string): boolean {
  const normalized = description.trim();
  if (normalized.length < 20) {
    return false;
  }

  const lowered = normalized.toLowerCase();
  return !INSTAGRAM_DESCRIPTION_FALLBACKS.some((phrase) => lowered === phrase || lowered.startsWith(`${phrase} `));
}

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(pattern)) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    try {
      blocks.push(JSON.parse(raw));
    } catch {
      continue;
    }
  }

  return blocks;
}

function normalizeCandidateText(value: string): string | null {
  const normalized = normalizeWhitespace(decodeHtmlEntities(value));
  return isUsefulDescription(normalized) ? normalized : null;
}

function extractTextFromStructuredValue(value: unknown, seen = new Set<object>()): string | null {
  if (typeof value === 'string') {
    return normalizeCandidateText(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractTextFromStructuredValue(item, seen);
      if (extracted) return extracted;
    }
    return null;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (seen.has(candidate)) {
    return null;
  }
  seen.add(candidate);

  for (const key of INSTAGRAM_TEXT_KEYS) {
    const extracted = extractTextFromStructuredValue(candidate[key], seen);
    if (extracted) return extracted;
  }

  for (const nested of Object.values(candidate)) {
    const extracted = extractTextFromStructuredValue(nested, seen);
    if (extracted) return extracted;
  }

  return null;
}

function extractStructuredInstagramText(html: string): string | null {
  for (const block of extractJsonLdBlocks(html)) {
    const extracted = extractTextFromStructuredValue(block);
    if (extracted) {
      return extracted;
    }
  }

  return null;
}

export function extractInstagramMetadata(html: string): { title: string | null; text: string | null; imageUrl: string | null } {
  const title = cleanInstagramTitle(
    extractMetaContent(html, 'og:title')
    ?? extractMetaContent(html, 'twitter:title'),
  );

  const rawDescription = extractMetaContent(html, 'og:description')
    ?? extractMetaContent(html, 'twitter:description')
    ?? extractMetaContent(html, 'description');

  const description = rawDescription ? normalizeWhitespace(decodeHtmlEntities(rawDescription)) : null;
  const structuredText = extractStructuredInstagramText(html);
  const imageUrl = extractMetaContent(html, 'og:image:secure_url')
    ?? extractMetaContent(html, 'og:image')
    ?? extractMetaContent(html, 'twitter:image:src')
    ?? extractMetaContent(html, 'twitter:image');

  return {
    title,
    text: description && isUsefulDescription(description) ? description : structuredText,
    imageUrl,
  };
}

export async function fetchInstagramMetadata(url: string): Promise<{ title: string | null; text: string | null; imageUrl: string | null }> {
  const response = await fetch(url, {
    headers: {
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': 'Mozilla/5.0 (compatible; AI-Learning-Inbox/1.0; +https://ai-learning-inbox.rxlab.workers.dev)',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Instagram fetch failed with status ${response.status}`);
  }

  const html = await response.text();
  return extractInstagramMetadata(html);
}
