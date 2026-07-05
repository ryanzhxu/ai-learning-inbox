import { Hono } from 'hono';

import { ingestPayloadSchema } from './domain/schemas';
import { buildDigest as buildDigestWithOpenAI, analyzePost } from './providers/openai';
import { fetchInstagramImageAsDataUrl, fetchInstagramMetadata } from './providers/instagram';
import { fetchXMetadata } from './providers/x';
import { fetchThreadsMetadata, isUsefulThreadsText } from './providers/threads';
import { D1Repository } from './repositories/d1';
import type { Env } from './types';
import { renderDashboard, renderDigest, renderPostDetail, renderPosts, renderShortcutSetup } from './ui/render';
import { fallbackDigestFromAnalyses } from './domain/digest';

function unauthorized(): Response {
  return new Response('Unauthorized', { status: 401 });
}

function requireSecret(request: Request, env: Env): boolean {
  return request.headers.get('x-aili-secret') === env.AILI_WEBHOOK_SECRET;
}

function getSourceHost(candidate: {
  source_platform: string;
  source_url: string;
  canonical_url?: string;
}): string {
  const source = candidate.canonical_url ?? candidate.source_url;
  return new URL(source).hostname.toLowerCase();
}

function isThreadsCandidate(candidate: {
  source_platform: string;
  source_url: string;
  canonical_url?: string;
}): boolean {
  const host = getSourceHost(candidate);
  const isThreadsUrl = host.includes('threads');
  const isThreadsPlatform = candidate.source_platform.trim().toLowerCase() === 'threads';

  return isThreadsUrl || isThreadsPlatform;
}

function isInstagramCandidate(candidate: {
  source_platform: string;
  source_url: string;
  canonical_url?: string;
}): boolean {
  const host = getSourceHost(candidate);
  const isInstagramUrl = host.includes('instagram');
  const isInstagramPlatform = candidate.source_platform.trim().toLowerCase() === 'instagram';

  return isInstagramUrl || isInstagramPlatform;
}

function isXCandidate(candidate: {
  source_platform: string;
  source_url: string;
  canonical_url?: string;
}): boolean {
  const host = getSourceHost(candidate);
  const isXUrl = host.includes('x.com') || host.includes('twitter.com');
  const isXPlatform = ['x', 'twitter'].includes(candidate.source_platform.trim().toLowerCase());

  return isXUrl || isXPlatform;
}

function buildFetchedNormalizedText(candidate: {
  normalized_text: string;
  shared_text: string | null;
  user_note: string | null;
  source_url?: string;
}, extractedText: string | null, fallbackLines: string[]): string {
  const sourceUrl = candidate.source_url?.trim();
  const segments: string[] = [];

  const resolvedText = extractedText?.trim();
  if (resolvedText) {
    segments.push(resolvedText);
  }

  const sharedText = candidate.shared_text?.trim();
  if (sharedText && sharedText !== sourceUrl && isUsefulThreadsText(sharedText)) {
    segments.push(sharedText);
  }

  const userNote = candidate.user_note?.trim();
  if (userNote) {
    segments.push(userNote);
  }

  const dedupedSegments = Array.from(new Set(segments));
  if (dedupedSegments.length > 0) {
    return dedupedSegments.join('\n\n');
  }

  return [candidate.normalized_text, ...fallbackLines].join('\n\n');
}

function buildThreadsNormalizedText(candidate: {
  normalized_text: string;
  shared_text: string | null;
  user_note: string | null;
  source_url?: string;
}, extractedText: string | null): string {
  return buildFetchedNormalizedText(candidate, extractedText, [
    'Threads content note: no public caption text could be extracted from the shared URL.',
    'Ask the user to paste the post text or upload screenshots if the post is image-heavy.',
  ]);
}

function buildInstagramNormalizedText(candidate: {
  normalized_text: string;
  shared_text: string | null;
  user_note: string | null;
  source_url?: string;
}, extractedText: string | null, imageUrl: string | null): string {
  return buildFetchedNormalizedText(candidate, extractedText, imageUrl
    ? [
        'Instagram content note: the public image was sent to vision analysis.',
        'If the capture is still unclear, ask the user to paste the caption or share a higher-resolution screenshot.',
      ]
    : [
        'Instagram content note: no public caption text could be extracted from the shared URL.',
        'Ask the user to paste the caption or upload screenshots if the post is image-heavy.',
      ]);
}

function buildXNormalizedText(candidate: {
  normalized_text: string;
  shared_text: string | null;
  user_note: string | null;
  source_url?: string;
}, extractedText: string | null): string {
  return buildFetchedNormalizedText(candidate, extractedText, [
    'X content note: no public post text could be extracted from the shared URL.',
    'Ask the user to paste the post text or share a screenshot if the post is image-heavy.',
  ]);
}

export async function processSubmissionJob(
  env: Env,
  submissionId: number,
  options?: { force?: boolean },
): Promise<void> {
  const repo = new D1Repository(env);
  const candidate = await repo.getSubmissionCandidate(submissionId);
  if (!candidate) {
    throw new Error(`Submission ${submissionId} not found`);
  }

  const promptVersion = 'cf-v1';
  try {
    let normalizedText = candidate.normalized_text;
    let imageUrl: string | null = null;

    if (isThreadsCandidate(candidate)) {
      try {
        const fetched = await fetchThreadsMetadata(candidate.canonical_url);
        normalizedText = buildThreadsNormalizedText(candidate, fetched.text);
        await repo.updatePostContent(candidate.post_id, {
          title: fetched.title ?? candidate.title,
          normalizedText,
        });
      } catch {
        normalizedText = buildThreadsNormalizedText(candidate, null);
        await repo.updatePostContent(candidate.post_id, {
          title: candidate.title,
          normalizedText,
        });
      }
    } else if (isInstagramCandidate(candidate)) {
      try {
        const fetched = await fetchInstagramMetadata(candidate.canonical_url);
        imageUrl = fetched.imageUrl ? await fetchInstagramImageAsDataUrl(fetched.imageUrl) : null;
        normalizedText = buildInstagramNormalizedText(candidate, fetched.text, imageUrl);
        await repo.updatePostContent(candidate.post_id, {
          title: fetched.title ?? candidate.title,
          normalizedText,
        });
      } catch {
        normalizedText = buildInstagramNormalizedText(candidate, null, null);
        await repo.updatePostContent(candidate.post_id, {
          title: candidate.title,
          normalizedText,
        });
      }
    } else if (isXCandidate(candidate)) {
      try {
        const fetched = await fetchXMetadata(candidate.canonical_url);
        normalizedText = buildXNormalizedText(candidate, fetched.text);
        await repo.updatePostContent(candidate.post_id, {
          title: fetched.title ?? candidate.title,
          normalizedText,
        });
      } catch {
        normalizedText = buildXNormalizedText(candidate, null);
        await repo.updatePostContent(candidate.post_id, {
          title: candidate.title,
          normalizedText,
        });
      }
    }

    if (!options?.force && await repo.hasExistingAnalysis(candidate.post_id, promptVersion)) {
      await repo.markSubmissionProcessed(submissionId);
      return;
    }

    const analysisInput = {
      platform: candidate.source_platform,
      canonicalUrl: candidate.canonical_url,
      normalizedText,
      imageUrl,
    };
    const analysis = await analyzePost(env, analysisInput).catch(async (error) => {
      if (!imageUrl) {
        throw error;
      }
      return analyzePost(env, {
        ...analysisInput,
        imageUrl: null,
      });
    });

    await repo.saveAnalysis({
      postId: candidate.post_id,
      modelName: analysis.modelName,
      promptVersion: analysis.promptVersion,
      summary: analysis.result.summary,
      whyItMatters: analysis.result.why_it_matters,
      analysisJson: analysis.rawJson,
      actionItems: analysis.result.action_items,
    });
    await repo.markSubmissionProcessed(submissionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await repo.markSubmissionFailed(submissionId, message);
    throw error;
  }
}

export async function createDigestJob(env: Env): Promise<number | null> {
  const repo = new D1Repository(env);
  const analyses = await repo.listRecentAnalyses({ hoursWindow: 24 });
  if (analyses.length === 0) {
    return null;
  }

  const fallback = fallbackDigestFromAnalyses(analyses);
  const digest = await buildDigestWithOpenAI(
    env,
    analyses.map((analysis) => ({
      summary: analysis.summary,
      why_it_matters: analysis.why_it_matters,
      action_items: analysis.action_items,
    })),
  ).catch(() => ({
    modelName: 'fallback-digest-v1',
    result: fallback,
    rawJson: JSON.stringify(fallback),
  }));

  return repo.saveDigest({
    summary: digest.result.summary,
    modelName: digest.modelName,
    actionItems: digest.result.action_items,
  });
}

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/health', async (c) => {
    const repo = new D1Repository(c.env);
    const stats = await repo.getDashboardStats();
    return c.json({ status: 'ok', app_env: c.env.APP_ENV ?? 'development', ...stats });
  });

  app.get('/', async (c) => {
    const repo = new D1Repository(c.env);
    const [stats, posts, digest] = await Promise.all([
      repo.getDashboardStats(),
      repo.listRecentPosts(8),
      repo.getLatestDigest(),
    ]);
    return c.html(renderDashboard(stats, posts, digest));
  });

  app.get('/posts', async (c) => {
    const repo = new D1Repository(c.env);
    return c.html(renderPosts(await repo.listRecentPosts(40)));
  });

  app.get('/posts/:id', async (c) => {
    const repo = new D1Repository(c.env);
    const post = await repo.getPostById(Number(c.req.param('id')));
    if (!post) {
      return c.text('Not found', 404);
    }
    return c.html(renderPostDetail(post));
  });

  app.get('/digests/latest', async (c) => {
    const repo = new D1Repository(c.env);
    return c.html(renderDigest(await repo.getLatestDigest()));
  });

  app.get('/setup/shortcut', async (c) => {
    const url = new URL(c.req.url);
    return c.html(renderShortcutSetup(url.origin));
  });

  app.post('/ingest/share', async (c) => {
    if (!requireSecret(c.req.raw, c.env)) {
      return unauthorized();
    }

    const parsed = ingestPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Invalid payload', issues: parsed.error.issues }, 400);
    }

    const payload = parsed.data;
    const repo = new D1Repository(c.env);
    const submissionId = await repo.createRawSubmission(payload);
    await repo.createOrUpdatePost(submissionId, payload);
    await c.env.ANALYSIS_QUEUE.send({ submissionId });
    return c.json({ status: 'accepted', submission_id: submissionId }, 202);
  });

  app.post('/internal/reprocess', async (c) => {
    if (!requireSecret(c.req.raw, c.env)) {
      return unauthorized();
    }

    const body = (await c.req.json().catch(() => ({}))) as { submission_id?: number; batch_size?: number; force?: boolean };
    const repo = new D1Repository(c.env);
    const force = typeof body.force === 'boolean' ? body.force : typeof body.submission_id === 'number';
    const ids = typeof body.submission_id === 'number'
      ? [body.submission_id]
      : await repo.getPendingSubmissionIds(Math.min(Math.max(body.batch_size ?? 10, 1), 25));

    const processed_ids: number[] = [];
    const failures: Array<{ submission_id: number; error: string }> = [];

    for (const id of ids) {
      try {
        await processSubmissionJob(c.env, id, { force });
        processed_ids.push(id);
      } catch (error) {
        failures.push({
          submission_id: id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return c.json(
      {
        status: failures.length > 0 ? 'partial_failure' : 'ok',
        processed_ids,
        failures,
      },
      failures.length > 0 ? 207 : 200,
    );
  });

  app.post('/internal/digest', async (c) => {
    if (!requireSecret(c.req.raw, c.env)) {
      return unauthorized();
    }

    const digestId = await createDigestJob(c.env);
    return c.json({ status: digestId ? 'created' : 'skipped', digest_id: digestId });
  });

  return app;
}
