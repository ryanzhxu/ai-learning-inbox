# AI Learning Inbox Project Context

This file is the short handoff for future Codex sessions.

## Goal

Capture AI-related social posts from the iPhone Share Sheet, process them into:

- `summary`
- `why_it_matters`
- `action_items`

Then show the results in a small private dashboard and nightly digest.

## Current State

- Cloudflare Worker is the main runtime.
- D1 is the source of truth.
- Queue handles async analysis.
- OpenAI is wired for analysis and digest generation.
- The app is deployed on Cloudflare under `ai-learning-inbox`.
- GitHub repo exists at `https://github.com/ryanzhxu/ai-learning-inbox`.

## Current Ingestion Flow

- iPhone Share Sheet posts a Threads, X, or Instagram URL and optional text/note to `POST /ingest/share`.
- Backend stores the raw submission in D1.
- Threads and X URLs are normalized and the backend tries to extract public post text first.
- If the shared URL points at an Instagram post, the backend also tries to pull the public image URL, inline the bytes when possible, and include it in vision analysis.
- If extraction fails, the app falls back gracefully and keeps enough context for analysis.

## Decisions Made

- Keep the app single-user and private.
- Keep the stored AI output minimal.
- Keep D1 as the primary datastore for now.
- Leave Notion as a future async sync target, not the main database.
- Focus on Threads/X first, but keep Instagram image support lightweight, inline when possible, and fallback-safe.

## How To Verify

- `npm run check`
- `npx wrangler dev`
- `npx wrangler deploy`

## Current Product Milestone

Action Loop v1 is the next productization step:

- Action items use `open`, `planned`, `acted_on`, and `dismissed` statuses.
- Reprocessing preserves statuses for unchanged actions and resets changed actions to `open`.
- The analysis prompt prioritizes a concrete, verifiable first experiment instead of broad project suggestions.
- The dashboard displays action status but remains read-only while dashboard authentication is paused.

The next product question is whether action follow-through is strong enough to justify customer authentication and a broader multi-user product. Do not add billing, automatic publishing, or multi-user ownership until usage evidence supports that direction.

## Deferred Product Work

- Add dashboard authentication before enabling browser status controls.
- Add better support for Threads replies when official API access is available.
- Use aggregate action-status and follow-through data to design the weekly learning review.
