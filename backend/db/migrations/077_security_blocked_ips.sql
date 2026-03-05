-- =================================================================================
-- 077: Security Blocked IPs — Cyber Command Center
-- =================================================================================
-- Admin can block malicious IPs; middleware checks before processing requests.
-- =================================================================================

CREATE TABLE IF NOT EXISTS security_blocked_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL,
  reason TEXT,
  blocked_by TEXT,
  blocked_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'removed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_security_blocked_ips_ip ON security_blocked_ips(ip_address) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_security_blocked_ips_status ON security_blocked_ips(status);
CREATE INDEX IF NOT EXISTS idx_security_blocked_ips_blocked_at ON security_blocked_ips(blocked_at DESC);

COMMENT ON TABLE security_blocked_ips IS 'Admin-blocked IPs for brute-force / abuse prevention';
