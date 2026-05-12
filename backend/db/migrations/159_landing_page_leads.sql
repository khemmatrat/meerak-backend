-- Pre-registration & KYC-lite from landing page (aqond.com) for admin / nexus-admin-core
CREATE TABLE IF NOT EXISTS landing_page_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'landing',
  full_name TEXT,
  contact TEXT NOT NULL,
  interest_service TEXT,
  first_name TEXT,
  last_name TEXT,
  national_id TEXT,
  date_of_birth DATE,
  address TEXT,
  kyc_started BOOLEAN NOT NULL DEFAULT false,
  raw_payload JSONB,
  CONSTRAINT landing_page_leads_contact_len CHECK (char_length(trim(contact)) >= 3)
);

CREATE INDEX IF NOT EXISTS idx_landing_page_leads_created ON landing_page_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_landing_page_leads_contact ON landing_page_leads (lower(trim(contact)));
