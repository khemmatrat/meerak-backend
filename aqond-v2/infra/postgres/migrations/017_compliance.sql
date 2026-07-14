-- P122-P128, P138: compliance / privacy / financial-crime / data lifecycle.

-- P122: per-region residency policies (extends Epoch 5 residency_audit)
CREATE TABLE IF NOT EXISTS commerce.residency_policies (
  region TEXT PRIMARY KEY,
  store_in TEXT NOT NULL,          -- physical region/cluster that must hold the data
  pii_localized BOOLEAN NOT NULL DEFAULT TRUE,
  cross_border_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NOT NULL DEFAULT ''
);
INSERT INTO commerce.residency_policies (region, store_in, pii_localized, cross_border_allowed) VALUES
  ('TH','ap-southeast-th',TRUE,TRUE),
  ('SEA','ap-southeast-1',TRUE,TRUE),
  ('EU','eu-central-1',TRUE,FALSE),
  ('US','us-east-1',FALSE,TRUE)
ON CONFLICT (region) DO NOTHING;

-- P123: Data Subject Requests (access / export / delete / rectify)
CREATE TABLE IF NOT EXISTS commerce.dsr_requests (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'TH',
  kind TEXT NOT NULL CHECK (kind IN ('access','export','delete','rectify','restrict')),
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','verifying','processing','completed','rejected')),
  due_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  result_uri TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dsr_subject ON commerce.dsr_requests (subject_id);

-- P124: consent ledger (marketing, cookies, data sharing, personalization)
CREATE TABLE IF NOT EXISTS commerce.consents (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'TH',
  purpose TEXT NOT NULL,           -- marketing | personalization | cookies | data_sharing
  granted BOOLEAN NOT NULL DEFAULT FALSE,
  version TEXT NOT NULL DEFAULT 'v1',
  source TEXT NOT NULL DEFAULT 'app',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consents_subject ON commerce.consents (subject_id, purpose, created_at DESC);

-- P125: KYC / KYB verifications (sellers, payouts)
CREATE TABLE IF NOT EXISTS commerce.kyc_verifications (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  subject_type TEXT NOT NULL DEFAULT 'individual' CHECK (subject_type IN ('individual','business')),
  region TEXT NOT NULL DEFAULT 'TH',
  level TEXT NOT NULL DEFAULT 'basic',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','rejected','expired','review')),
  doc_type TEXT NOT NULL DEFAULT '',
  risk_score INT NOT NULL DEFAULT 0,
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kyc_subject ON commerce.kyc_verifications (subject_id);

-- P126: AML / sanctions screening hits
CREATE TABLE IF NOT EXISTS commerce.aml_screenings (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'TH',
  list_type TEXT NOT NULL DEFAULT 'sanctions',  -- sanctions | pep | adverse_media
  matched BOOLEAN NOT NULL DEFAULT FALSE,
  match_score INT NOT NULL DEFAULT 0,
  decision TEXT NOT NULL DEFAULT 'clear' CHECK (decision IN ('clear','review','block')),
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aml_subject ON commerce.aml_screenings (subject_id);

-- P127/P128: age verification + parental controls
CREATE TABLE IF NOT EXISTS commerce.age_verifications (
  subject_id TEXT PRIMARY KEY,
  region TEXT NOT NULL DEFAULT 'TH',
  birth_year INT,
  age_band TEXT NOT NULL DEFAULT 'unknown' CHECK (age_band IN ('unknown','under13','13to17','adult')),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  method TEXT NOT NULL DEFAULT 'self_declared',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commerce.parental_links (
  id TEXT PRIMARY KEY,
  guardian_id TEXT NOT NULL,
  minor_id TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'TH',
  spend_cap_micro BIGINT NOT NULL DEFAULT 0,
  restrictions JSONB NOT NULL DEFAULT '{}',
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (guardian_id, minor_id)
);

-- P138: retention policies + deletion jobs
CREATE TABLE IF NOT EXISTS commerce.retention_policies (
  data_class TEXT PRIMARY KEY,     -- pii | order | payment | logs | content
  retain_days INT NOT NULL,
  legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
  region TEXT NOT NULL DEFAULT '*'
);
INSERT INTO commerce.retention_policies (data_class, retain_days, region) VALUES
  ('pii',1095,'*'),('order',2555,'*'),('payment',2555,'*'),('logs',90,'*'),('content',365,'*')
ON CONFLICT (data_class) DO NOTHING;

COMMENT ON TABLE commerce.dsr_requests IS 'P123 data subject requests with statutory due dates';
