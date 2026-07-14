-- P129, P130, P132, P139: policy engine / legal CMS / payment routing / reporting.

-- P129: region-aware feature flags + policy rules
CREATE TABLE IF NOT EXISTS commerce.feature_flags (
  key TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT '*',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_pct INT NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  variant JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (key, region)
);
INSERT INTO commerce.feature_flags (key, region, enabled, rollout_pct) VALUES
  ('cross_border_checkout','*',TRUE,100),
  ('live_shopping','TH',TRUE,100),
  ('live_shopping','EU',FALSE,0)
ON CONFLICT (key, region) DO NOTHING;

CREATE TABLE IF NOT EXISTS commerce.policy_rules (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,            -- checkout | content | ads | payout | shipping
  region TEXT NOT NULL DEFAULT '*',
  effect TEXT NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny','require')),
  condition JSONB NOT NULL DEFAULT '{}',
  priority INT NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- P130: legal documents (ToS/Privacy/seller terms) + acceptance ledger
CREATE TABLE IF NOT EXISTS commerce.legal_documents (
  id TEXT PRIMARY KEY,
  doc_type TEXT NOT NULL,          -- tos | privacy | seller_terms | cookie
  region TEXT NOT NULL DEFAULT '*',
  locale TEXT NOT NULL DEFAULT 'th-TH',
  version TEXT NOT NULL,
  body_uri TEXT NOT NULL DEFAULT '',
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (doc_type, region, locale, version)
);

INSERT INTO commerce.legal_documents (id, doc_type, region, locale, version, body_uri) VALUES
  ('legal-tos-th','tos','*','th-TH','2026.1','/legal/tos/th-2026.1'),
  ('legal-tos-en','tos','*','en-US','2026.1','/legal/tos/en-2026.1'),
  ('legal-privacy-th','privacy','*','th-TH','2026.1','/legal/privacy/th-2026.1')
ON CONFLICT (doc_type, region, locale, version) DO NOTHING;

CREATE TABLE IF NOT EXISTS commerce.legal_acceptances (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_legal_accept_subject ON commerce.legal_acceptances (subject_id, doc_type);

-- P132: regional payment-method availability + routing
CREATE TABLE IF NOT EXISTS commerce.payment_method_availability (
  id TEXT PRIMARY KEY,
  region TEXT NOT NULL,
  method TEXT NOT NULL,            -- card | promptpay | cod | grabpay | paynow ...
  provider TEXT NOT NULL,
  currency TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT NOT NULL DEFAULT 100,
  min_micro BIGINT NOT NULL DEFAULT 0,
  max_micro BIGINT NOT NULL DEFAULT 0,
  UNIQUE (region, method, provider)
);
INSERT INTO commerce.payment_method_availability (id, region, method, provider, currency, priority) VALUES
  ('pm-th-pp','TH','promptpay','stub-th','THB',10),
  ('pm-th-card','TH','card','stub-card','THB',20),
  ('pm-th-cod','TH','cod','internal','THB',30),
  ('pm-sg-paynow','SEA','paynow','stub-sg','SGD',10),
  ('pm-us-card','US','card','stub-card','USD',10)
ON CONFLICT (region, method, provider) DO NOTHING;

-- P139: compliance reporting register (audit/export jobs)
CREATE TABLE IF NOT EXISTS commerce.compliance_reports (
  id TEXT PRIMARY KEY,
  report_type TEXT NOT NULL,       -- transaction | dsr | aml | tax_remittance
  region TEXT NOT NULL DEFAULT '*',
  period TEXT NOT NULL,            -- e.g. 2026-Q2
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generated','filed')),
  metrics JSONB NOT NULL DEFAULT '{}',
  uri TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE commerce.feature_flags IS 'P129 region-aware feature flags / policy engine';
