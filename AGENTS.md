# AGENTS.md

Project-specific guidance for `ai-learning-inbox`.

## Scope

- Treat the Cloudflare Worker app as the primary runtime.
- Keep the older Python prototype only as reference unless the task explicitly asks for it.
- Make the smallest change that keeps `iPhone Share Sheet -> Worker webhook -> D1 -> Queue -> analysis -> dashboard` working.

## Architecture

- Entry worker: `worker/index.ts`
- App routes and queue handling: `worker/app.ts`
- Domain logic: `worker/domain/*`
- Persistence: `worker/repositories/d1.ts`
- Providers: `worker/providers/*`
- UI rendering: `worker/ui/render.ts`

## Current product boundary

- Single-user internal tool.
- D1 is the source of truth.
- OpenAI output for single-post analysis should stay limited to:
  - `summary`
  - `why_it_matters`
  - `action_items`
- Do not add extra AI metadata unless explicitly requested.

## Local commands

```bash
npm install
npm run typecheck
npm run test
npm run check
npx wrangler dev
```

## Deployment notes

- Cloudflare Worker name: `ai-learning-inbox`
- Main config: `wrangler.jsonc`
- D1 migration folder: `migrations/`
- Secrets are managed in Cloudflare, not committed to the repo.

## Editing guardrails

- Prefer changing Worker files over touching the Python prototype.
- Keep prompt/schema changes aligned with tests in `tests/*.test.ts`.
- When fixing ingestion issues, verify both normalization and reprocess behavior.
- Preserve current manual share flow before adding broader automation.
