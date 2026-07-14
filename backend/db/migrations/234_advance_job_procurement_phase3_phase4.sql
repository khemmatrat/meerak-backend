-- 234: Advance Job Procurement Phase 3/4
-- Government-ready procurement package + immutable revision/audit + AI pricing/risk metadata

CREATE TABLE IF NOT EXISTS advance_job_procurement_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES advance_jobs(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(20) NOT NULL DEFAULT 'employer',
  winner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  winner_reason TEXT,
  tor_sow_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_before_negotiation NUMERIC(12,2),
  price_after_negotiation NUMERIC(12,2),
  package_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_price_recommended NUMERIC(12,2),
  ai_risk_score INTEGER,
  fraud_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  document_hash VARCHAR(128) NOT NULL,
  prev_hash VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_advance_job_proc_revisions_job_created
  ON advance_job_procurement_revisions(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_advance_job_proc_revisions_created
  ON advance_job_procurement_revisions(created_at DESC);

CREATE TABLE IF NOT EXISTS advance_job_procurement_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id UUID NOT NULL REFERENCES advance_job_procurement_revisions(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES advance_jobs(id) ON DELETE CASCADE,
  document_kind VARCHAR(40) NOT NULL,
  format VARCHAR(10) NOT NULL CHECK (format IN ('csv', 'pdf', 'json')),
  file_name VARCHAR(255) NOT NULL,
  document_hash VARCHAR(128) NOT NULL,
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advance_job_proc_docs_revision
  ON advance_job_procurement_documents(revision_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS advance_job_procurement_audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES advance_jobs(id) ON DELETE CASCADE,
  revision_id UUID REFERENCES advance_job_procurement_revisions(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(20) NOT NULL DEFAULT 'system',
  action VARCHAR(80) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  event_hash VARCHAR(128) NOT NULL,
  prev_hash VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advance_job_proc_audit_job_created
  ON advance_job_procurement_audit_trail(job_id, created_at DESC);

COMMENT ON TABLE advance_job_procurement_revisions IS 'Phase 3: immutable procurement package revisions per advance job';
COMMENT ON TABLE advance_job_procurement_documents IS 'Phase 3: generated procurement export docs (CSV/PDF) with hash/timestamp';
COMMENT ON TABLE advance_job_procurement_audit_trail IS 'Phase 3: append-only audit trail hash chain for procurement actions';
