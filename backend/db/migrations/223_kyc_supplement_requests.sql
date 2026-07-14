-- KYC supplement: admin ขอเอกสารเพิ่มเฉพาะ (ป้ายเหลือง / ใบขับขี่สาธารณะ) โดยไม่ให้ user กรอก KYC ใหม่ทั้งชุด

CREATE TABLE IF NOT EXISTS kyc_supplement_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_docs JSONB NOT NULL DEFAULT '[]'::jsonb,
  instruction TEXT NOT NULL DEFAULT '',
  deadline TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_by VARCHAR(64),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kyc_supplement_user_status
  ON kyc_supplement_requests(user_id, status, created_at DESC);
