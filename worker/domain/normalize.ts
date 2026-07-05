import type { IngestPayload } from '../types';

export function canonicalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = '';
  const isThreads = url.hostname.toLowerCase().includes('threads');
  const isX = url.hostname.toLowerCase().includes('x.com') || url.hostname.toLowerCase().includes('twitter.com');

  const cleanParams = new URLSearchParams();
  for (const [key, value] of url.searchParams.entries()) {
    if (
      key.startsWith('utm_')
      || key === 'igshid'
      || key === 'fbclid'
      || (isThreads && (key === 'xmt' || key === 'slof'))
      || (isX && key === 's')
    ) {
      continue;
    }
    cleanParams.append(key, value);
  }
  url.search = cleanParams.toString();

  return url.toString();
}

export function inferPlatform(platform: string, sourceUrl: string): string {
  const host = new URL(sourceUrl).hostname.toLowerCase();
  if (host.includes('threads')) return 'threads';
  if (host.includes('instagram')) return 'instagram';
  if (host.includes('xiaohongshu') || host.includes('xiaohongshu') || host.includes('rednote')) return 'rednote';
  if (host.includes('x.com') || host.includes('twitter')) return 'x';

  const lowered = platform.trim().toLowerCase();
  if (lowered) {
    return lowered;
  }

  return 'unknown';
}

export function extractExternalPostId(canonicalUrl: string): string | null {
  const url = new URL(canonicalUrl);
  const segments = url.pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? null;
}

export function deriveTitle(payload: IngestPayload): string {
  const source = payload.shared_text?.trim() || payload.user_note?.trim() || payload.source_url;
  const compact = source.replace(/\s+/g, ' ').trim();
  if (compact.length <= 80) {
    return compact;
  }
  return `${compact.slice(0, 77)}...`;
}

export function buildNormalizedText(payload: IngestPayload, canonicalUrl: string): string {
  const segments = [payload.shared_text?.trim(), payload.user_note?.trim()].filter(Boolean);
  if (segments.length === 0) {
    return `Saved ${payload.source_platform} post: ${canonicalUrl}`;
  }
  return segments.join('\n\n');
}

export function normalizeForInsert(payload: IngestPayload) {
  const canonicalUrl = canonicalizeUrl(payload.source_url);
  return {
    platform: inferPlatform(payload.source_platform, payload.source_url),
    canonicalUrl,
    externalPostId: extractExternalPostId(canonicalUrl),
    title: deriveTitle(payload),
    normalizedText: buildNormalizedText(payload, canonicalUrl),
  };
}
