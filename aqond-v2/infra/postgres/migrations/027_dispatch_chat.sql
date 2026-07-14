-- Phase 4b: dispatch chat + customer contact fields

ALTER TABLE commerce.dispatch_jobs
  ADD COLUMN IF NOT EXISTS customer_phone TEXT,
  ADD COLUMN IF NOT EXISTS recipient_name TEXT;

CREATE TABLE IF NOT EXISTS commerce.dispatch_chat_messages (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES commerce.dispatch_jobs(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  from_role TEXT NOT NULL CHECK (from_role IN ('rider', 'customer')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dispatch_chat_order ON commerce.dispatch_chat_messages (order_id, created_at);
