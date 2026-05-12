-- Persistent support tickets & messages (multi-instance, survives deploy)
-- Run on all environments that use PostgreSQL for the main backend.

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'anonymous',
  email TEXT,
  full_name TEXT,
  phone TEXT,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  category TEXT NOT NULL DEFAULT 'General'
    CHECK (category IN ('Billing', 'Technical', 'Account', 'General')),
  source TEXT NOT NULL DEFAULT 'help_support',
  job_id TEXT,
  use_insurance_claim BOOLEAN NOT NULL DEFAULT FALSE,
  ai_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  invited_provider_id TEXT,
  invited_provider_name TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_summary TEXT,
  sentiment_score DOUBLE PRECISION,
  sentiment_label TEXT,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_to_admin_id TEXT,
  assigned_to_name TEXT,
  waiting_on TEXT NOT NULL DEFAULT 'none'
    CHECK (waiting_on IN ('none', 'customer', 'internal')),
  first_admin_reply_at TIMESTAMPTZ,
  sla_due_at TIMESTAMPTZ,
  is_emergency BOOLEAN NOT NULL DEFAULT FALSE,
  emergency_kind TEXT
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_updated ON support_tickets (status, last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_emergency ON support_tickets (is_emergency, last_updated DESC) WHERE is_emergency = TRUE;
CREATE INDEX IF NOT EXISTS idx_support_tickets_job ON support_tickets (job_id) WHERE job_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  message TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_time ON support_messages (ticket_id, created_at);
