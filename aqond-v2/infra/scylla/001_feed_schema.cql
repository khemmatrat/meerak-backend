-- P33: Feed/timeline data model on ScyllaDB (single-node dev-lite)

CREATE KEYSPACE IF NOT EXISTS feed
  WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

USE feed;

-- Per-user timeline (fan-out-on-write). Clustering by post_ts DESC for cursor pagination.
CREATE TABLE IF NOT EXISTS timeline_by_user (
  user_id text,
  post_ts timeuuid,
  post_id text,
  author_id text,
  media_id text,
  post_type text,
  caption text,
  payload text,
  PRIMARY KEY (user_id, post_ts, post_id)
) WITH CLUSTERING ORDER BY (post_ts DESC);

-- Author posts (source of truth + hybrid read for hot authors).
CREATE TABLE IF NOT EXISTS posts_by_author (
  author_id text,
  post_ts timeuuid,
  post_id text,
  media_id text,
  post_type text,
  caption text,
  payload text,
  PRIMARY KEY (author_id, post_ts, post_id)
) WITH CLUSTERING ORDER BY (post_ts DESC);

-- Follow graph: who I follow.
CREATE TABLE IF NOT EXISTS follow_graph (
  follower_id text,
  followee_id text,
  created_at timestamp,
  PRIMARY KEY (follower_id, followee_id)
);

-- Reverse index for fan-out: who follows me.
CREATE TABLE IF NOT EXISTS followers_by_user (
  followee_id text,
  follower_id text,
  created_at timestamp,
  PRIMARY KEY (followee_id, follower_id)
);

-- Author tier for hybrid fan-out (normal vs hot/celebrity).
CREATE TABLE IF NOT EXISTS author_tier (
  author_id text PRIMARY KEY,
  tier text,
  follower_count int,
  updated_at timestamp
);

-- Idempotency for fan-out worker.
CREATE TABLE IF NOT EXISTS fanout_processed (
  post_id text PRIMARY KEY,
  processed_at timestamp
);
