-- =============================================================================
-- 153: RBAC — SUPER_ADMIN / ACCOUNTANT + บัญชีรับชั่วคราว (ก่อน Gateway)
-- =============================================================================

-- ขยาย role ใน user_roles (เดิม 009: USER, ADMIN, AUDITOR)
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN (
    'USER', 'ADMIN', 'AUDITOR',
    'SUPER_ADMIN', 'ACCOUNTANT', 'SUPPORT', 'DEVELOPER'
  ));

COMMENT ON TABLE user_roles IS 'RBAC: USER, ADMIN, AUDITOR, SUPER_ADMIN, ACCOUNTANT, SUPPORT, DEVELOPER';

-- บัญชีรับชั่วคราว (แถวเดียว — singleton)
CREATE TABLE IF NOT EXISTS personal_settlement_account (
  singleton_key TEXT PRIMARY KEY DEFAULT 'default' CHECK (singleton_key = 'default'),
  label TEXT NOT NULL DEFAULT 'บัญชีรับชั่วคราว',
  bank_name TEXT NOT NULL DEFAULT '',
  account_holder_name TEXT NOT NULL DEFAULT '',
  account_number TEXT NOT NULL DEFAULT '',
  prompt_pay_id TEXT,
  preferred_mobile_bank_apps TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

-- รายการรับ/จ่าย (ขาเข้า + ขาออก)
CREATE TABLE IF NOT EXISTS personal_settlement_record (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
  channel TEXT NOT NULL,
  amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'THB',
  reference_label TEXT NOT NULL,
  bank_reference TEXT,
  transfer_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PENDING_RECONCILE'
    CHECK (status IN ('PENDING_RECONCILE', 'MATCHED', 'FLAGGED')),
  notes TEXT,
  slip_url TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMPTZ,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_ps_record_created ON personal_settlement_record(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ps_record_direction ON personal_settlement_record(direction);

-- กันบันทึกซ้ำจากเลขอ้างอิงธนาคารเดียวกัน (เมื่อกรอก ref)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ps_record_bank_ref_unique
  ON personal_settlement_record (lower(trim(bank_reference)))
  WHERE bank_reference IS NOT NULL AND trim(bank_reference) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ps_record_idempotency_unique
  ON personal_settlement_record (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND trim(idempotency_key) <> '';

COMMENT ON TABLE personal_settlement_account IS 'ชั่วคราว: บัญชีส่วนบุคคลรับเงินก่อน Gateway — audit ใน audit_log';
COMMENT ON TABLE personal_settlement_record IS 'รายการรับ/จ่าย manual + slip_url — ห้ามซ้ำ bank_reference เมื่อกรอก';
