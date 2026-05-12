-- =============================================================================
-- 172: SUPER_ADMIN สำหรับ admin@nexus.com + ทะเบียนเกตเวย์ + บัญชีจ่ายบริษัทเดียว (อ้างอิง)
-- =============================================================================

-- บทบาท SUPER_ADMIN สำหรับบัญชีแอดมินหลัก (users.id เป็น TEXT ใน user_roles)
INSERT INTO user_roles (user_id, role, updated_at)
SELECT u.id::text, 'SUPER_ADMIN', NOW()
FROM users u
WHERE lower(trim(u.email)) = 'admin@nexus.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'SUPER_ADMIN', updated_at = NOW();

-- ทะเบียนเกตเวย์ (ไม่เก็บ secret — มีแค่ env_hints เป็นชื่อตัวแปร)
CREATE TABLE IF NOT EXISTS payment_gateway_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id VARCHAR(64) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'psp'
    CHECK (category IN ('psp', 'bank_direct', 'card', 'other')),
  lifecycle VARCHAR(24) NOT NULL DEFAULT 'planned'
    CHECK (lifecycle IN ('planned', 'config_ready', 'live')),
  enabled BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  env_hints JSONB NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pgr_gateway_id_lower ON payment_gateway_registry (lower(gateway_id));

COMMENT ON TABLE payment_gateway_registry IS 'ทะเบียนเกตเวย์เสริม — ไม่เก็บ secret; env_hints = ชื่อตัวแปร ENV';

-- แถวเริ่มต้น (ถ้ายังไม่มี)
INSERT INTO payment_gateway_registry (gateway_id, display_name, category, lifecycle, enabled, sort_order, env_hints)
SELECT 'twoc2p', '2C2P', 'psp', 'planned', false, 10, '{"merchant_id_env":"TWOC2P_MERCHANT_ID"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM payment_gateway_registry WHERE lower(gateway_id) = 'twoc2p');

INSERT INTO payment_gateway_registry (gateway_id, display_name, category, lifecycle, enabled, sort_order, env_hints)
SELECT 'gb_prime_pay', 'GB Prime Pay', 'psp', 'planned', false, 20, '{"merchant_id_env":"GBPRIMEPAY_MERCHANT_ID"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM payment_gateway_registry WHERE lower(gateway_id) = 'gb_prime_pay');

-- บัญชีบริษัทสำหรับจ่ายเงิน (อ้างอิง company_bank_accounts.id) — ว่าง = ยังไม่บังคับ
INSERT INTO system_settings (key, value, updated_at)
VALUES ('company_sole_disbursement_bank_account_id', '', NOW())
ON CONFLICT (key) DO NOTHING;
