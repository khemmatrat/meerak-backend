-- P36-P45: Media ingest metadata + posts + user interests (commerce database)

CREATE TABLE IF NOT EXISTS commerce.media (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  merchant_id TEXT,
  shard_key TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'TH',
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'video/mp4',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  duration_ms INT,
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'processing', 'moderated', 'ready', 'rejected', 'published')),
  moderation_score REAL,
  moderation_labels JSONB NOT NULL DEFAULT '[]',
  hls_manifest_key TEXT,
  thumbnail_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_author ON commerce.media (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_status ON commerce.media (status, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce.posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  media_id TEXT,
  post_type TEXT NOT NULL DEFAULT 'video',
  caption TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_posts_author ON commerce.posts (author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce.user_interests (
  user_id TEXT PRIMARY KEY,
  interests JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commerce.feed_experiments (
  user_id TEXT NOT NULL,
  experiment_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, experiment_id)
);
