import { describe, expect, it } from 'vitest';

import { createApp } from '../worker/app';

const app = createApp();

const baseEnv = {
  DB: {} as D1Database,
  ANALYSIS_QUEUE: { send: async () => undefined } as unknown as Queue<{ submissionId: number }>,
  OPENAI_API_KEY: 'test',
  AILI_WEBHOOK_SECRET: 'secret',
  OPENAI_MODEL: 'gpt-5.4-nano',
  APP_ENV: 'test',
};

const digestEnv = {
  ...baseEnv,
  DB: {
    prepare() {
      return {
        bind() {
          return {
            all: async () => ({ results: [] }),
            first: async () => null,
            run: async () => ({ meta: {} }),
          };
        },
      };
    },
  } as unknown as D1Database,
};

const metricsEnv = {
  ...baseEnv,
  DB: {
    prepare(sql: string) {
      if (sql.includes('COUNT(*) AS analysis_count')) {
        return {
          bind() {
            return { first: async () => ({
              analysis_count: 10,
              input_tokens: 1200,
              output_tokens: 500,
              average_latency_ms: 321.4,
              fallback_count: 2,
            }) };
          },
        };
      }
      if (sql.includes('SELECT evidence_kind')) {
        return { bind() { return { all: async () => ({ results: [{ evidence_kind: 'text', count: 8 }, { evidence_kind: 'image', count: 2 }] }) }; } };
      }
      if (sql.includes('SELECT asset_status')) {
        return { bind() { return { all: async () => ({ results: [{ asset_status: 'not_applicable', count: 8 }, { asset_status: 'downloaded', count: 2 }] }) }; } };
      }
      if (sql.includes('SELECT action_items.status')) {
        return { bind() { return { all: async () => ({ results: [{ status: 'open', count: 6 }, { status: 'acted_on', count: 4 }] }) }; } };
      }
      if (sql.includes('SELECT action_items.usefulness')) {
        return { bind() { return { all: async () => ({ results: [{ usefulness: 'useful', count: 3 }] }) }; } };
      }
      throw new Error(`unexpected metrics query: ${sql}`);
    },
  } as unknown as D1Database,
};

function actionStatusEnv(changes: number) {
  return {
    ...baseEnv,
    DB: {
      prepare() {
        return {
          bind() {
            return { run: async () => ({ meta: { changes } }) };
          },
        };
      },
    } as unknown as D1Database,
  };
}

describe('app auth', () => {
  it('renders the iPhone shortcut setup page', async () => {
    const response = await app.request('https://example.com/setup/shortcut', { method: 'GET' }, baseEnv);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('Wrap your webhook in a share sheet.');
    expect(text).toContain('Noto Sans HK');
  });

  it('rejects webhook calls without secret', async () => {
    const response = await app.request('/ingest/share', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source_platform: 'threads',
        source_url: 'https://www.threads.net/@demo/post/abc123',
      }),
    }, baseEnv);

    expect(response.status).toBe(401);
  });

  it('returns validation errors for malformed payloads', async () => {
    const response = await app.request('/ingest/share', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-aili-secret': 'secret',
      },
      body: JSON.stringify({ source_platform: '', source_url: 'not-a-url' }),
    }, baseEnv);

    expect(response.status).toBe(400);
  });

  it('skips internal digest without a secret', async () => {
    const response = await app.request('/internal/digest', { method: 'POST' }, digestEnv);

    expect(response.status).toBe(401);
  });

  it('returns skipped for an empty internal digest run', async () => {
    const response = await app.request('/internal/digest', {
      method: 'POST',
      headers: {
        'x-aili-secret': 'secret',
      },
    }, digestEnv);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'skipped',
      digest_id: null,
    });
  });

  it('protects aggregate metrics and returns only measurement data', async () => {
    const unauthorizedResponse = await app.request('/internal/metrics', { method: 'GET' }, metricsEnv);
    expect(unauthorizedResponse.status).toBe(401);

    const response = await app.request('/internal/metrics?days=7', {
      method: 'GET',
      headers: { 'x-aili-secret': 'secret' },
    }, metricsEnv);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      period_days: 7,
      analyses: {
        count: 10,
        input_tokens: 1200,
        output_tokens: 500,
        average_latency_ms: 321,
        fallback_count: 2,
        fallback_rate: 0.2,
      },
      evidence_kind: { text: 8, image: 2 },
      asset_status: { not_applicable: 8, downloaded: 2 },
      action_status: { open: 6, acted_on: 4 },
      action_usefulness: { useful: 3 },
    });
  });

  it('rejects aggregate metric windows outside the safe range', async () => {
    const response = await app.request('/internal/metrics?days=365', {
      method: 'GET',
      headers: { 'x-aili-secret': 'secret' },
    }, metricsEnv);

    expect(response.status).toBe(400);
  });

  it('protects the action review list and validates its filters', async () => {
    const response = await app.request('/internal/action-items', { method: 'GET' }, baseEnv);
    expect(response.status).toBe(401);

    const invalid = await app.request('/internal/action-items?status=done', {
      method: 'GET',
      headers: { 'x-aili-secret': 'secret' },
    }, baseEnv);
    expect(invalid.status).toBe(400);
  });

  it('returns a safe action review list without source URLs', async () => {
    const reviewEnv = {
      ...baseEnv,
      DB: {
        prepare(sql: string) {
          if (sql.includes('action_items.id') && sql.includes('latest_analyses')) {
            return {
              bind() {
                return {
                  all: async () => ({ results: [{
                    id: 7,
                    post_id: 3,
                    platform: 'threads',
                    title: 'Run the smallest experiment',
                    description: 'Steps: 1) test one workflow. Done when the result is recorded.',
                    difficulty: 'easy',
                    estimated_minutes: 30,
                    status: 'open',
                    status_updated_at: null,
                    usefulness: null,
                    usefulness_updated_at: null,
                    created_at: '2026-07-13T00:00:00.000Z',
                  }] }),
                };
              },
            };
          }
          throw new Error(`unexpected review query: ${sql}`);
        },
      } as unknown as D1Database,
    };

    const response = await app.request('/internal/action-items?status=open&days=30&limit=10', {
      method: 'GET',
      headers: { 'x-aili-secret': 'secret' },
    }, reviewEnv);

    expect(response.status).toBe(200);
    const body = await response.json() as { actions: Array<Record<string, unknown>> };
    expect(body.actions).toHaveLength(1);
    expect(body.actions[0]).toMatchObject({ id: 7, post_id: 3, status: 'open' });
    expect(body.actions[0]).not.toHaveProperty('source_url');
    expect(body.actions[0]).not.toHaveProperty('normalized_text');
  });

  it('rejects action status updates without a secret', async () => {
    const response = await app.request('/internal/action-items/1/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'planned' }),
    }, actionStatusEnv(1));

    expect(response.status).toBe(401);
  });

  it('rejects invalid action statuses', async () => {
    const response = await app.request('/internal/action-items/1/status', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-aili-secret': 'secret',
      },
      body: JSON.stringify({ status: 'done' }),
    }, actionStatusEnv(1));

    expect(response.status).toBe(400);
  });

  it('rejects invalid action item ids', async () => {
    const response = await app.request('/internal/action-items/not-an-id/status', {
      method: 'POST',
      headers: {
        'x-aili-secret': 'secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'planned' }),
    }, actionStatusEnv(1));

    expect(response.status).toBe(400);
  });

  it('returns not found for an unknown action item', async () => {
    const response = await app.request('/internal/action-items/999/status', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-aili-secret': 'secret',
      },
      body: JSON.stringify({ status: 'acted_on' }),
    }, actionStatusEnv(0));

    expect(response.status).toBe(404);
  });

  it('updates action usefulness through the protected feedback endpoint', async () => {
    const response = await app.request('/internal/action-items/1/feedback', {
      method: 'POST',
      headers: {
        'x-aili-secret': 'secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ usefulness: 'useful' }),
    }, actionStatusEnv(1));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'updated',
      action_item_id: 1,
      usefulness: 'useful',
    });
  });

  it('rejects invalid action usefulness values', async () => {
    const response = await app.request('/internal/action-items/1/feedback', {
      method: 'POST',
      headers: {
        'x-aili-secret': 'secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ usefulness: 'maybe' }),
    }, actionStatusEnv(1));

    expect(response.status).toBe(400);
  });

  it('updates a valid action status', async () => {
    const response = await app.request('/internal/action-items/1/status', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-aili-secret': 'secret',
      },
      body: JSON.stringify({ status: 'planned' }),
    }, actionStatusEnv(1));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'updated',
      action_item_id: 1,
      action_status: 'planned',
    });
  });
});
