PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  source TEXT,
  section TEXT,
  language TEXT NOT NULL DEFAULT 'ca',
  editorial_status TEXT NOT NULL DEFAULT 'published'
    CHECK (editorial_status IN (
      'captured',
      'verified',
      'enriched',
      'published',
      'distributed',
      'archived',
      'rejected'
    )),
  published_at TEXT,
  payload_json TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS stories_status_published_idx
  ON stories (editorial_status, published_at DESC);

CREATE INDEX IF NOT EXISTS stories_section_published_idx
  ON stories (section, published_at DESC);

CREATE TABLE IF NOT EXISTS editions (
  id TEXT PRIMARY KEY,
  edition_date TEXT NOT NULL,
  slot TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('processing', 'published', 'distributed', 'failed')),
  story_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  published_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS editions_date_idx
  ON editions (edition_date DESC, published_at DESC);

CREATE TABLE IF NOT EXISTS edition_stories (
  edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (edition_id, story_id)
);

CREATE INDEX IF NOT EXISTS edition_stories_order_idx
  ON edition_stories (edition_id, position);

CREATE TABLE IF NOT EXISTS pipeline_jobs (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL,
  result_json TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS pipeline_jobs_status_idx
  ON pipeline_jobs (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS delivery_runs (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  edition_id TEXT REFERENCES editions(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('completed', 'partial', 'failed', 'skipped')),
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS delivery_runs_edition_idx
  ON delivery_runs (edition_id, channel);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL DEFAULT 'ca',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  action_token TEXT UNIQUE,
  source TEXT,
  subscribed_at TEXT NOT NULL,
  last_pending_at TEXT,
  confirmed_at TEXT,
  unsubscribed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS newsletter_subscribers_status_idx
  ON newsletter_subscribers (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS newsletter_subscribers_action_idx
  ON newsletter_subscribers (action_token);
