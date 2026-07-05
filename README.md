# AI Learning Inbox on Cloudflare

Private internal tool for capturing AI-related social posts and turning them into:

- short summaries
- why-it-matters notes
- action items you can try yourself
- a nightly digest

## Stack

- Cloudflare Workers
- Cloudflare D1
- Cloudflare Queues
- Cloudflare Cron Triggers
- OpenAI API
- Hono + TypeScript

## Current architecture

`iPhone Share Sheet -> Worker webhook -> D1 -> Queue -> OpenAI analysis -> D1 -> dashboard`

Nightly:

`Cron -> digest job -> D1 -> dashboard`

## What this version intentionally stores

Each analyzed post only keeps:

- `summary`
- `why_it_matters`
- `action_items`

This keeps token usage tighter than the earlier Python prototype.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy local secrets:

```bash
cp .dev.vars.example .dev.vars
```

3. Apply local D1 migration:

```bash
npx wrangler d1 migrations apply ai-learning-inbox --local
```

4. Start the worker locally:

```bash
npm run dev
```

## Required secrets and bindings

Local `.dev.vars`:

- `OPENAI_API_KEY`
- `AILI_WEBHOOK_SECRET`
- optional `OPENAI_MODEL`

Cloudflare runtime:

- D1 binding: `DB`
- Queue binding: `ANALYSIS_QUEUE`
- secrets: `OPENAI_API_KEY`, `AILI_WEBHOOK_SECRET`

## Main routes

- `POST /ingest/share`
- `POST /internal/reprocess`
- `POST /internal/digest`
- `GET /`
- `GET /posts`
- `GET /posts/:id`
- `GET /digests/latest`
- `GET /health`

## Sample webhook payload

Send JSON to `POST /ingest/share` with header `x-aili-secret`:

```json
{
  "source_platform": "threads",
  "source_url": "https://www.threads.net/@user/post/abc123",
  "shared_text": "A concise note about multi-step agents and evals.",
  "user_note": "Worth testing in a toy workflow.",
  "capture_method": "shortcut"
}
```

## Useful commands

```bash
npm run check
npx wrangler d1 migrations apply ai-learning-inbox --local
npx wrangler dev
```

## Notes for later

- D1 is the source of truth.
- Notion should be added later as an async sync target, not the primary database.
- The old Python prototype still remains in the repo for reference while this Cloudflare version becomes the main runtime.
