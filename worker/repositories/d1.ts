import type {
  ActionItemInput,
  ActionItemView,
  ActionStatus,
  ActionReviewItem,
  ActionUsefulness,
  AggregateMetrics,
  AnalysisView,
  DashboardStats,
  DigestView,
  Env,
  IngestPayload,
  AnalysisMetrics,
  PostListItem,
  SubmissionCandidate,
} from '../types';
import { normalizeForInsert } from '../domain/normalize';

function nowIso(): string {
  return new Date().toISOString();
}

function actionIdentity(title: string, description: string): string {
  return `${title.trim().toLowerCase()}\n${description.trim().toLowerCase()}`;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  return JSON.parse(value) as T;
}

async function getLastRowId(result: D1Result): Promise<number> {
  const rowId = result.meta.last_row_id;
  if (typeof rowId !== 'number') {
    throw new Error('Could not determine inserted row id');
  }
  return rowId;
}

export class D1Repository {
  constructor(private readonly env: Env) {}

  async createRawSubmission(payload: IngestPayload): Promise<number> {
    const timestamp = nowIso();
    const result = await this.env.DB.prepare(
      `INSERT INTO raw_submissions (
        source_platform, source_url, payload_json, shared_text, user_note, capture_method, shared_at, status, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
      .bind(
        payload.source_platform.trim().toLowerCase(),
        payload.source_url,
        JSON.stringify(payload),
        payload.shared_text ?? null,
        payload.user_note ?? null,
        payload.capture_method ?? 'shortcut',
        payload.shared_at ?? null,
        timestamp,
      )
      .run();

    return getLastRowId(result);
  }

  async createOrUpdatePost(rawSubmissionId: number, payload: IngestPayload): Promise<number> {
    const normalized = normalizeForInsert(payload);
    const timestamp = nowIso();
    await this.env.DB.prepare(
      `INSERT INTO posts (
        raw_submission_id, platform, canonical_url, external_post_id, title, normalized_text, normalized_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(raw_submission_id) DO UPDATE SET
        platform = excluded.platform,
        canonical_url = excluded.canonical_url,
        external_post_id = excluded.external_post_id,
        title = excluded.title,
        normalized_text = excluded.normalized_text,
        normalized_at = excluded.normalized_at`
    )
      .bind(
        rawSubmissionId,
        normalized.platform,
        normalized.canonicalUrl,
        normalized.externalPostId,
        normalized.title,
        normalized.normalizedText,
        timestamp,
      )
      .run();

    const post = await this.env.DB.prepare(
      `SELECT id FROM posts WHERE raw_submission_id = ?`
    )
      .bind(rawSubmissionId)
      .first<{ id: number }>();

    if (!post) {
      throw new Error('Post was not created');
    }

    return post.id;
  }

  async getSubmissionCandidate(submissionId: number): Promise<SubmissionCandidate | null> {
    return (await this.env.DB.prepare(
      `SELECT
        raw_submissions.id AS raw_submission_id,
        posts.id AS post_id,
        raw_submissions.source_platform,
        raw_submissions.source_url,
        raw_submissions.shared_text,
        raw_submissions.user_note,
        raw_submissions.capture_method,
        raw_submissions.shared_at,
        posts.canonical_url,
        posts.normalized_text,
        posts.title
      FROM raw_submissions
      INNER JOIN posts ON posts.raw_submission_id = raw_submissions.id
      WHERE raw_submissions.id = ?`
    )
      .bind(submissionId)
      .first()) as SubmissionCandidate | null;
  }

  async getPendingSubmissionIds(limit = 10): Promise<number[]> {
    const rows = await this.env.DB.prepare(
      `SELECT id FROM raw_submissions WHERE status = 'pending' ORDER BY received_at ASC LIMIT ?`
    )
      .bind(limit)
      .all<{ id: number }>();
    return rows.results.map((row) => row.id);
  }

  async hasExistingAnalysis(postId: number, promptVersion: string): Promise<boolean> {
    const row = await this.env.DB.prepare(
      `SELECT id FROM analyses WHERE post_id = ? AND prompt_version = ? LIMIT 1`
    )
      .bind(postId, promptVersion)
      .first<{ id: number }>();
    return Boolean(row);
  }

  async saveAnalysis(params: {
    postId: number;
    modelName: string;
    promptVersion: string;
    summary: string;
    whyItMatters: string;
    analysisJson: string;
    actionItems: ActionItemInput[];
    metrics: AnalysisMetrics;
  }): Promise<number> {
    const timestamp = nowIso();
    const existing = await this.env.DB.prepare(
      `SELECT id FROM analyses WHERE post_id = ? AND prompt_version = ? LIMIT 1`
    )
      .bind(params.postId, params.promptVersion)
      .first<{ id: number }>();

    let analysisId: number;
    const previousAnalysis = existing ?? await this.env.DB.prepare(
      `SELECT id FROM analyses WHERE post_id = ? ORDER BY analyzed_at DESC LIMIT 1`
    )
      .bind(params.postId)
      .first<{ id: number }>();
    const previousItems = new Map<string, Array<{
      status: ActionStatus;
      status_updated_at: string | null;
      usefulness: ActionUsefulness | null;
      usefulness_updated_at: string | null;
    }>>();
    const previousAnalysisId = (existing ?? previousAnalysis)?.id;
    if (previousAnalysisId) {
      const previous = await this.env.DB.prepare(
        `SELECT title, description, status, status_updated_at, usefulness, usefulness_updated_at
         FROM action_items WHERE analysis_id = ? ORDER BY position ASC`
      )
        .bind(previousAnalysisId)
        .all<{
          title: string;
          description: string;
          status: ActionStatus;
          status_updated_at: string | null;
          usefulness: ActionUsefulness | null;
          usefulness_updated_at: string | null;
        }>();
      for (const item of previous.results) {
        const key = actionIdentity(item.title, item.description);
        const matches = previousItems.get(key) ?? [];
        matches.push({
          status: item.status,
          status_updated_at: item.status_updated_at,
          usefulness: item.usefulness,
          usefulness_updated_at: item.usefulness_updated_at,
        });
        previousItems.set(key, matches);
      }
    }

    if (existing) {
      analysisId = existing.id;
      await this.env.DB.prepare(
        `UPDATE analyses SET model_name = ?, summary = ?, why_it_matters = ?, analysis_json = ?, input_tokens = ?, output_tokens = ?, latency_ms = ?, evidence_kind = ?, asset_status = ?, detail_level = ?, fallback_used = ?, analyzed_at = ? WHERE id = ?`
      )
        .bind(
          params.modelName,
          params.summary,
          params.whyItMatters,
          params.analysisJson,
          params.metrics.inputTokens,
          params.metrics.outputTokens,
          params.metrics.latencyMs,
          params.metrics.evidenceKind,
          params.metrics.assetStatus,
          params.metrics.detailLevel,
          params.metrics.fallbackUsed ? 1 : 0,
          timestamp,
          analysisId,
        )
        .run();
      await this.env.DB.prepare(`DELETE FROM action_items WHERE analysis_id = ?`).bind(analysisId).run();
    } else {
      const result = await this.env.DB.prepare(
        `INSERT INTO analyses (
          post_id, model_name, prompt_version, summary, why_it_matters, analysis_json,
          input_tokens, output_tokens, latency_ms, evidence_kind, asset_status, detail_level, fallback_used, analyzed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          params.postId,
          params.modelName,
          params.promptVersion,
          params.summary,
          params.whyItMatters,
          params.analysisJson,
          params.metrics.inputTokens,
          params.metrics.outputTokens,
          params.metrics.latencyMs,
          params.metrics.evidenceKind,
          params.metrics.assetStatus,
          params.metrics.detailLevel,
          params.metrics.fallbackUsed ? 1 : 0,
          timestamp,
        )
        .run();
      analysisId = await getLastRowId(result);
    }

    for (const [position, item] of params.actionItems.entries()) {
      const matches = previousItems.get(actionIdentity(item.title, item.description));
      const previous = matches?.shift();
      await this.env.DB.prepare(
        `INSERT INTO action_items (
          analysis_id, title, description, difficulty, estimated_minutes,
          status, status_updated_at, usefulness, usefulness_updated_at, position, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          analysisId,
          item.title,
          item.description,
          item.difficulty,
          item.estimated_minutes,
          previous?.status ?? 'open',
          previous?.status_updated_at ?? null,
          previous?.usefulness ?? null,
          previous?.usefulness_updated_at ?? null,
          position,
          timestamp,
        )
        .run();
    }

    return analysisId;
  }

  async updatePostContent(postId: number, params: { title?: string | null; normalizedText: string }): Promise<void> {
    await this.env.DB.prepare(
      `UPDATE posts
       SET title = COALESCE(?, title),
           normalized_text = ?,
           normalized_at = ?
       WHERE id = ?`
    )
      .bind(params.title ?? null, params.normalizedText, nowIso(), postId)
      .run();
  }

  async markSubmissionProcessed(submissionId: number): Promise<void> {
    await this.env.DB.prepare(
      `UPDATE raw_submissions SET status = 'processed', error_message = NULL, processed_at = ? WHERE id = ?`
    )
      .bind(nowIso(), submissionId)
      .run();
  }

  async markSubmissionFailed(submissionId: number, message: string): Promise<void> {
    await this.env.DB.prepare(
      `UPDATE raw_submissions SET status = 'failed', error_message = ?, processed_at = ? WHERE id = ?`
    )
      .bind(message.slice(0, 1000), nowIso(), submissionId)
      .run();
  }

  async getDashboardStats(): Promise<DashboardStats> {
    const rows = await this.env.DB.prepare(
      `SELECT status, COUNT(*) as count FROM raw_submissions GROUP BY status`
    ).all<{ status: string; count: number }>();
    const counts = Object.fromEntries(rows.results.map((row) => [row.status, Number(row.count)]));
    const totalPostsRow = await this.env.DB.prepare(`SELECT COUNT(*) as count FROM posts`).first<{ count: number }>();
    return {
      pending: counts.pending ?? 0,
      processed: counts.processed ?? 0,
      failed: counts.failed ?? 0,
      total_posts: Number(totalPostsRow?.count ?? 0),
    };
  }

  async getAggregateMetrics(days: number): Promise<AggregateMetrics> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const analysis = await this.env.DB.prepare(
      `SELECT
         COUNT(*) AS analysis_count,
         COALESCE(SUM(input_tokens), 0) AS input_tokens,
         COALESCE(SUM(output_tokens), 0) AS output_tokens,
         COALESCE(AVG(latency_ms), 0) AS average_latency_ms,
         COALESCE(SUM(fallback_used), 0) AS fallback_count
       FROM analyses
       WHERE analyzed_at >= ?`
    )
      .bind(since)
      .first<{
        analysis_count: number;
        input_tokens: number;
        output_tokens: number;
        average_latency_ms: number;
        fallback_count: number;
      }>();

    const evidenceRows = await this.env.DB.prepare(
      `SELECT evidence_kind, COUNT(*) AS count
       FROM analyses
       WHERE analyzed_at >= ?
       GROUP BY evidence_kind
       ORDER BY evidence_kind`
    )
      .bind(since)
      .all<{ evidence_kind: string; count: number }>();

    const assetRows = await this.env.DB.prepare(
      `SELECT asset_status, COUNT(*) AS count
       FROM analyses
       WHERE analyzed_at >= ?
       GROUP BY asset_status
       ORDER BY asset_status`
    )
      .bind(since)
      .all<{ asset_status: string; count: number }>();

    const actionRows = await this.env.DB.prepare(
      `WITH latest_analyses AS (
         SELECT post_id, MAX(id) AS analysis_id
         FROM analyses
         WHERE analyzed_at >= ?
         GROUP BY post_id
       )
       SELECT action_items.status, COUNT(*) AS count
       FROM latest_analyses
       INNER JOIN action_items ON action_items.analysis_id = latest_analyses.analysis_id
       GROUP BY action_items.status
       ORDER BY action_items.status`
    )
      .bind(since)
      .all<{ status: string; count: number }>();

    const usefulnessRows = await this.env.DB.prepare(
      `WITH latest_analyses AS (
         SELECT post_id, MAX(id) AS analysis_id
         FROM analyses
         WHERE analyzed_at >= ?
         GROUP BY post_id
       )
       SELECT action_items.usefulness, COUNT(*) AS count
       FROM latest_analyses
       INNER JOIN action_items ON action_items.analysis_id = latest_analyses.analysis_id
       WHERE action_items.usefulness IS NOT NULL
       GROUP BY action_items.usefulness
       ORDER BY action_items.usefulness`
    )
      .bind(since)
      .all<{ usefulness: string; count: number }>();

    const toCounts = (rows: Array<{ count: number; [key: string]: string | number }>, key: string): Record<string, number> =>
      Object.fromEntries(rows.map((row) => [String(row[key]), Number(row.count)]));

    return {
      analysisCount: Number(analysis?.analysis_count ?? 0),
      inputTokens: Number(analysis?.input_tokens ?? 0),
      outputTokens: Number(analysis?.output_tokens ?? 0),
      averageLatencyMs: Math.round(Number(analysis?.average_latency_ms ?? 0)),
      fallbackCount: Number(analysis?.fallback_count ?? 0),
      evidenceKind: toCounts(evidenceRows.results, 'evidence_kind'),
      assetStatus: toCounts(assetRows.results, 'asset_status'),
      actionStatus: toCounts(actionRows.results, 'status'),
      actionUsefulness: toCounts(usefulnessRows.results, 'usefulness'),
    };
  }

  async listActionItemsForReview(params: {
    days: number;
    status: ActionStatus;
    limit: number;
  }): Promise<ActionReviewItem[]> {
    const since = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000).toISOString();
    const rows = await this.env.DB.prepare(
      `WITH latest_analyses AS (
         SELECT post_id, MAX(id) AS analysis_id
         FROM analyses
         WHERE analyzed_at >= ?
         GROUP BY post_id
       )
       SELECT
         action_items.id,
         posts.id AS post_id,
         posts.platform,
         action_items.title,
         action_items.description,
         action_items.difficulty,
         action_items.estimated_minutes,
         action_items.status,
         action_items.status_updated_at,
         action_items.usefulness,
         action_items.usefulness_updated_at,
         action_items.created_at
       FROM latest_analyses
       INNER JOIN analyses ON analyses.id = latest_analyses.analysis_id
       INNER JOIN posts ON posts.id = analyses.post_id
       INNER JOIN action_items ON action_items.analysis_id = analyses.id
       WHERE action_items.status = ?
       ORDER BY analyses.analyzed_at DESC, action_items.position ASC
       LIMIT ?`
    )
      .bind(since, params.status, params.limit)
      .all<ActionReviewItem>();

    return rows.results;
  }

  async listRecentPosts(limit = 12): Promise<PostListItem[]> {
    const rows = await this.env.DB.prepare(
      `SELECT id, platform, canonical_url, title, normalized_text, normalized_at
       FROM posts
       ORDER BY normalized_at DESC
       LIMIT ?`
    )
      .bind(limit)
      .all<{
        id: number;
        platform: string;
        canonical_url: string;
        title: string | null;
        normalized_text: string;
        normalized_at: string;
      }>();

    const posts: PostListItem[] = [];
    for (const row of rows.results) {
      posts.push({
        ...row,
        analysis: await this.getLatestAnalysisForPost(row.id),
      });
    }
    return posts;
  }

  async getPostById(postId: number): Promise<PostListItem | null> {
    const row = await this.env.DB.prepare(
      `SELECT id, platform, canonical_url, title, normalized_text, normalized_at
       FROM posts WHERE id = ?`
    )
      .bind(postId)
      .first<{
        id: number;
        platform: string;
        canonical_url: string;
        title: string | null;
        normalized_text: string;
        normalized_at: string;
      }>();

    if (!row) return null;
    return {
      ...row,
      analysis: await this.getLatestAnalysisForPost(row.id),
    };
  }

  async getLatestAnalysisForPost(postId: number): Promise<AnalysisView | null> {
    const analysis = await this.env.DB.prepare(
      `SELECT id, summary, why_it_matters, model_name, prompt_version, analyzed_at
       FROM analyses WHERE post_id = ? ORDER BY analyzed_at DESC LIMIT 1`
    )
      .bind(postId)
      .first<{
        id: number;
        summary: string;
        why_it_matters: string;
        model_name: string;
        prompt_version: string;
        analyzed_at: string;
      }>();
    if (!analysis) return null;

    const items = await this.env.DB.prepare(
      `SELECT id, title, description, difficulty, estimated_minutes, status, status_updated_at, usefulness, usefulness_updated_at, position
       FROM action_items WHERE analysis_id = ? ORDER BY position ASC`
    )
      .bind(analysis.id)
      .all<ActionItemView>();

    return {
      id: analysis.id,
      summary: analysis.summary,
      why_it_matters: analysis.why_it_matters,
      model_name: analysis.model_name,
      prompt_version: analysis.prompt_version,
      analyzed_at: analysis.analyzed_at,
      action_items: items.results,
    };
  }

  async listRecentAnalyses(options: { hoursWindow: number }): Promise<AnalysisView[]> {
    const since = new Date(Date.now() - options.hoursWindow * 60 * 60 * 1000).toISOString();
    const rows = await this.env.DB.prepare(
      `SELECT id, summary, why_it_matters, model_name, prompt_version, analyzed_at
       FROM analyses WHERE analyzed_at >= ? ORDER BY analyzed_at DESC`
    )
      .bind(since)
      .all<{
        id: number;
        summary: string;
        why_it_matters: string;
        model_name: string;
        prompt_version: string;
        analyzed_at: string;
      }>();

    const analyses: AnalysisView[] = [];
    for (const row of rows.results) {
      const items = await this.env.DB.prepare(
        `SELECT id, title, description, difficulty, estimated_minutes, status, status_updated_at, usefulness, usefulness_updated_at, position
         FROM action_items WHERE analysis_id = ? ORDER BY position ASC`
      )
        .bind(row.id)
        .all<ActionItemView>();
      analyses.push({
        id: row.id,
        summary: row.summary,
        why_it_matters: row.why_it_matters,
        model_name: row.model_name,
        prompt_version: row.prompt_version,
        analyzed_at: row.analyzed_at,
        action_items: items.results,
      });
    }

    return analyses;
  }

  async updateActionItemStatus(actionItemId: number, status: ActionStatus): Promise<boolean> {
    const result = await this.env.DB.prepare(
      `UPDATE action_items SET status = ?, status_updated_at = ? WHERE id = ?`
    )
      .bind(status, nowIso(), actionItemId)
      .run();

    return Number(result.meta.changes ?? 0) > 0;
  }

  async updateActionItemUsefulness(actionItemId: number, usefulness: ActionUsefulness): Promise<boolean> {
    const result = await this.env.DB.prepare(
      `UPDATE action_items SET usefulness = ?, usefulness_updated_at = ? WHERE id = ?`
    )
      .bind(usefulness, nowIso(), actionItemId)
      .run();

    return Number(result.meta.changes ?? 0) > 0;
  }

  async saveDigest(params: { summary: string; modelName: string; actionItems: ActionItemInput[]; }): Promise<number> {
    const result = await this.env.DB.prepare(
      `INSERT INTO digests (summary, priority_json, coverage_count, model_name, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(params.summary, JSON.stringify(params.actionItems), params.actionItems.length, params.modelName, nowIso())
      .run();
    return getLastRowId(result);
  }

  async getLatestDigest(): Promise<DigestView | null> {
    const row = await this.env.DB.prepare(
      `SELECT id, summary, priority_json, coverage_count, model_name, created_at
       FROM digests ORDER BY created_at DESC LIMIT 1`
    ).first<{
      id: number;
      summary: string;
      priority_json: string;
      coverage_count: number;
      model_name: string;
      created_at: string;
    }>();

    if (!row) return null;
    return {
      id: row.id,
      summary: row.summary,
      coverage_count: Number(row.coverage_count),
      model_name: row.model_name,
      created_at: row.created_at,
      action_items: parseJson(row.priority_json, []),
    };
  }
}
