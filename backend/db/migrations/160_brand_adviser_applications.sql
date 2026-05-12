-- ใบสมัคร Brand Adviser จากหน้า landing → admin ตรวจ / อนุมัติ (เชื่อมสิทธิ์จริงผ่าน grant บน users)
CREATE TABLE IF NOT EXISTS brand_adviser_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  full_name TEXT NOT NULL,
  contact TEXT NOT NULL,
  primary_platform TEXT NOT NULL CHECK (primary_platform IN ('youtube', 'tiktok', 'instagram', 'facebook', 'other')),
  primary_profile_url TEXT NOT NULL,
  link_youtube TEXT,
  link_tiktok TEXT,
  link_instagram TEXT,
  link_facebook TEXT,
  follower_count_declared INTEGER CHECK (follower_count_declared IS NULL OR follower_count_declared >= 0),
  motivation TEXT,
  read_rules_accepted BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected')),
  admin_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  linked_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  raw_payload JSONB,
  CONSTRAINT brand_adviser_applications_contact_len CHECK (char_length(trim(contact)) >= 3),
  CONSTRAINT brand_adviser_applications_primary_url_len CHECK (char_length(trim(primary_profile_url)) >= 8)
);

CREATE INDEX IF NOT EXISTS idx_ba_applications_created ON brand_adviser_applications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ba_applications_status ON brand_adviser_applications (status);
CREATE INDEX IF NOT EXISTS idx_ba_applications_contact ON brand_adviser_applications (lower(trim(contact)));
