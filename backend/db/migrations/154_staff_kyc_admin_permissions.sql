-- STAFF_KYC role + JSON capabilities on users (admin panel)
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN (
    'USER', 'ADMIN', 'AUDITOR',
    'SUPER_ADMIN', 'ACCOUNTANT', 'SUPPORT', 'DEVELOPER',
    'STAFF_KYC'
  ));

COMMENT ON TABLE user_roles IS 'RBAC: includes STAFF_KYC for KYC-focused staff with optional admin_permissions on users';

ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_permissions JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN users.admin_permissions IS 'Admin UI capabilities: e.g. FINANCIAL_AUDIT_READ, PAYOUT_QUEUE_VIEW, PAYOUT_APPROVE, KYC_REVIEW_ONLY';
