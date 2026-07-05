CREATE TABLE IF NOT EXISTS raw_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_platform TEXT NOT NULL,
  source_url TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  shared_text TEXT,
  user_note TEXT,
  capture_method TEXT NOT NULL DEFAULT 'shortcut',
  shared_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_raw_submissions_status_received_at
  ON raw_submissions(status, received_at DESC);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_submission_id INTEGER NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  external_post_id TEXT,
  title TEXT,
  normalized_text TEXT NOT NULL DEFAULT '',
  normalized_at TEXT NOT NULL,
  sync_state_json TEXT,
  FOREIGN KEY (raw_submission_id) REFERENCES raw_submissions(id)
);

CREATE INDEX IF NOT EXISTS idx_posts_normalized_at
  ON posts(normalized_at DESC);

CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  model_name TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  summary TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  analysis_json TEXT,
  analyzed_at TEXT NOT NULL,
  UNIQUE(post_id, prompt_version),
  FOREIGN KEY (post_id) REFERENCES posts(id)
);

CREATE INDEX IF NOT EXISTS idx_analyses_post_id_analyzed_at
  ON analyses(post_id, analyzed_at DESC);

CREATE TABLE IF NOT EXISTS action_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'medium',
  estimated_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'open',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (analysis_id) REFERENCES analyses(id)
);

CREATE INDEX IF NOT EXISTS idx_action_items_analysis_position
  ON action_items(analysis_id, position ASC);

CREATE TABLE IF NOT EXISTS digests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  summary TEXT NOT NULL,
  priority_json TEXT NOT NULL,
  coverage_count INTEGER NOT NULL DEFAULT 0,
  model_name TEXT NOT NULL,
  sync_state_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_digests_created_at
  ON digests(created_at DESC);
