import { describe, expect, it } from 'vitest';

import { createApp } from '../worker/app';

const app = createApp();

const env = {
  DB: {} as D1Database,
  ANALYSIS_QUEUE: { send: async () => undefined } as unknown as Queue<{ submissionId: number }>,
  OPENAI_API_KEY: 'test',
  AILI_WEBHOOK_SECRET: 'secret',
  OPENAI_MODEL: 'gpt-4.1-mini',
  APP_ENV: 'test',
};

describe('app auth', () => {
  it('renders the iPhone shortcut setup page', async () => {
    const response = await app.request('https://example.com/setup/shortcut', { method: 'GET' }, env);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Wrap your webhook in a share sheet.');
  });

  it('rejects webhook calls without secret', async () => {
    const response = await app.request('/ingest/share', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source_platform: 'threads',
        source_url: 'https://www.threads.net/@demo/post/abc123',
      }),
    }, env);

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
    }, env);

    expect(response.status).toBe(400);
  });
});
