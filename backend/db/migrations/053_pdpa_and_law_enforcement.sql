-- =================================================================================
-- 053: PDPA Data Export + Law Enforcement Requests
-- สำหรับ User Requests (PDPA) และ Law Enforcement (Police/Court) ใน Legal Compliance
-- =================================================================================

-- 1. PDPA Data Export Requests (สิทธิขอข้อมูลส่วนบุคคลตาม PDPA)
CREATE TABLE IF NOT EXISTS pdpa_data_export_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'rejected')) DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline TIMESTAMPTZ, -- PDPA: 30 วัน
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES users(id),
  admin_notes TEXT,
  export_file_url TEXT, -- ลิงก์ดาวน์โหลดเมื่อเสร็จ
  ip_address VARCHAR(100),
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_pdpa_export_user_id ON pdpa_data_export_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_pdpa_export_status ON pdpa_data_export_requests(status, requested_at DESC);

-- 2. Law Enforcement Requests (คำสั่งศาล / หมายเรียก)
CREATE TABLE IF NOT EXISTS law_enforcement_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id VARCHAR(100), -- เลขคดี
  agency VARCHAR(255), -- หน่วยงาน (เช่น Cyber Crime Division)
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- ผู้ใช้ที่ถูกเรียก
  request_type VARCHAR(50) DEFAULT 'warrant', -- warrant, court_order, subpoena
  documents JSONB, -- [{name: 'Warrant_992.pdf', url: '...'}]
  deadline DATE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'processing', 'responded', 'rejected')) DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  responded_by UUID REFERENCES users(id),
  response_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_law_enforcement_status ON law_enforcement_requests(status);
CREATE INDEX IF NOT EXISTS idx_law_enforcement_target ON law_enforcement_requests(target_user_id);
