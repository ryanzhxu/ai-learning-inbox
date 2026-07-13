ALTER TABLE analyses ADD COLUMN input_tokens INTEGER;
ALTER TABLE analyses ADD COLUMN output_tokens INTEGER;
ALTER TABLE analyses ADD COLUMN latency_ms INTEGER;
ALTER TABLE analyses ADD COLUMN evidence_kind TEXT NOT NULL DEFAULT 'text';
ALTER TABLE analyses ADD COLUMN asset_status TEXT NOT NULL DEFAULT 'not_applicable';
ALTER TABLE analyses ADD COLUMN detail_level TEXT;
ALTER TABLE analyses ADD COLUMN fallback_used INTEGER NOT NULL DEFAULT 0;
