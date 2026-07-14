-- P91-P98: Search — dev-lite engine backed by Postgres FTS + trigram.
-- (Prod backend is OpenSearch; search-svc keeps a backend seam, see SEARCH_BACKEND.)
-- One document table covers all entity tabs: products/shops/users/video/sound/LIVE.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- P91/P93: multi-entity search documents
CREATE TABLE IF NOT EXISTS commerce.search_documents (
  id TEXT PRIMARY KEY,                       -- "<entity_type>:<entity_id>"
  entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'shop', 'user', 'video', 'sound', 'live')),
  entity_id TEXT NOT NULL,
  shard_key TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT 'TH',
  locale TEXT NOT NULL DEFAULT 'th',
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  -- P94 filterable/sortable facets
  price_micro BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  rating NUMERIC(3,2) NOT NULL DEFAULT 0,
  sold_count BIGINT NOT NULL DEFAULT 0,
  ship_from_region TEXT NOT NULL DEFAULT '',
  cod_available BOOLEAN NOT NULL DEFAULT FALSE,
  popularity DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  ts tsvector,
  metadata JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_search_ts ON commerce.search_documents USING GIN (ts);
CREATE INDEX IF NOT EXISTS idx_search_title_trgm ON commerce.search_documents USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_search_facets ON commerce.search_documents (entity_type, category, ship_from_region, cod_available);
CREATE INDEX IF NOT EXISTS idx_search_sort ON commerce.search_documents (entity_type, sold_count DESC, rating DESC);

-- Keep ts in sync (P96 Thai handled at query time via plainto/simple config)
CREATE OR REPLACE FUNCTION commerce.search_documents_tsupdate() RETURNS trigger AS $$
BEGIN
  NEW.ts := setweight(to_tsvector('simple', coalesce(NEW.title,'')), 'A')
         || setweight(to_tsvector('simple', array_to_string(NEW.tags,' ')), 'B')
         || setweight(to_tsvector('simple', coalesce(NEW.body,'')), 'C');
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_search_tsupdate ON commerce.search_documents;
CREATE TRIGGER trg_search_tsupdate BEFORE INSERT OR UPDATE ON commerce.search_documents
  FOR EACH ROW EXECUTE FUNCTION commerce.search_documents_tsupdate();

-- P96: synonyms + romanization map (locale aware)
CREATE TABLE IF NOT EXISTS commerce.search_synonyms (
  id BIGSERIAL PRIMARY KEY,
  locale TEXT NOT NULL DEFAULT 'th',
  term TEXT NOT NULL,
  synonyms TEXT[] NOT NULL DEFAULT '{}',
  UNIQUE (locale, term)
);

-- P95/P98: query log for autocomplete trending + analytics
CREATE TABLE IF NOT EXISTS commerce.search_queries (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  locale TEXT NOT NULL DEFAULT 'th',
  region TEXT NOT NULL DEFAULT 'TH',
  query TEXT NOT NULL,
  tab TEXT NOT NULL DEFAULT 'product',
  result_count INT NOT NULL DEFAULT 0,
  clicked_entity_id TEXT,
  latency_ms INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_search_queries_q ON commerce.search_queries (query, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_queries_zero ON commerce.search_queries (created_at DESC) WHERE result_count = 0;

COMMENT ON TABLE commerce.search_documents IS 'P91-P98 unified multi-entity search index (dev-lite Postgres FTS)';
