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

The public AI output for each analyzed post only keeps:

- `summary`
- `why_it_matters`
- `action_items`

This keeps token usage tighter than the earlier Python prototype.

Private processing metrics also record token usage, latency, evidence type, asset reliability, image detail level, and whether an image fallback was used. These metrics support cost control and paid-product validation without expanding the user-facing analysis schema.

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
- `POST /internal/action-items/:id/status`
- `GET /internal/action-items?status=open&days=30&limit=25` (secret-protected review list)
- `POST /internal/action-items/:id/feedback` (secret-protected usefulness feedback)
- `GET /internal/metrics?days=30` (secret-protected aggregate product metrics)
- `POST /internal/reprocess`
- `POST /internal/digest`
- `GET /`
- `GET /posts`
- `GET /posts/:id`
- `GET /digests/latest`
- `GET /health`

## CI

- Pushes to `main` run `npm run check` and then `npx wrangler deploy`.
- `main` is branch-protected with the `CI / verify` required status check.
- No review approval is required before `main` updates.

## Sample webhook payload

Send JSON to `POST /ingest/share` with header `x-aili-secret`:

```json
{
  "source_platform": "x",
  "source_url": "https://x.com/user/status/1234567890",
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
