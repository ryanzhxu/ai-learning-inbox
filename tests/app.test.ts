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
