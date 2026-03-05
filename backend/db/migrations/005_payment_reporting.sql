-- backend/db/migrations/005_payment_reporting.sql
-- รันหลัง 002 — สร้าง payment_holds, report_cache, indexes, views

-- 0. แก้ schema ถ้า transactions ไม่มี user_id (กรณี schema ผิด)
DO $$
DECLARE
  first_user_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions' AND column_name='user_id') THEN
    SELECT id INTO first_user_id FROM users LIMIT 1;
    ALTER TABLE transactions ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
    IF first_user_id IS NOT NULL THEN
      UPDATE transactions SET user_id = first_user_id WHERE user_id IS NULL;
      ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL;
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 1. Payment holds สำหรับกันเงิน
CREATE TABLE IF NOT EXISTS payment_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id),
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    expires_at TIMESTAMP NOT NULL,
    released_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Report cache สำหรับ performance
CREATE TABLE IF NOT EXISTS report_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type VARCHAR(50) NOT NULL,
    period VARCHAR(20) NOT NULL,
    data JSONB NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_payment_holds_job_id ON payment_holds(job_id);
CREATE INDEX IF NOT EXISTS idx_payment_holds_status ON payment_holds(status);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_job_id ON transactions(job_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_by ON audit_logs(changed_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_at ON audit_logs(changed_at);

-- 4. Views สำหรับ reporting
DROP VIEW IF EXISTS user_earnings_summary;
DROP VIEW IF EXISTS daily_earnings;
CREATE VIEW daily_earnings AS
SELECT DATE(created_at) as date,
       SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_earnings,
       COUNT(*) as total_transactions,
       COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_transactions
FROM transactions GROUP BY DATE(created_at);

CREATE VIEW user_earnings_summary AS
SELECT user_id, DATE_TRUNC('month', created_at) as month,
       SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as monthly_earnings,
       COUNT(*) as total_transactions
FROM transactions GROUP BY user_id, DATE_TRUNC('month', created_at);
