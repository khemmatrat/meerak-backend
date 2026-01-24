-- backend/db/migrations/005_payment_reporting.sql

-- 1. Transactions table สำหรับ payment tracking
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    job_id UUID NOT NULL REFERENCES jobs(id),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'THB',
    payment_method VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded
    transaction_type VARCHAR(20) NOT NULL, -- payment, refund, withdrawal, commission
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- 2. Payment holds สำหรับกันเงิน
CREATE TABLE IF NOT EXISTS payment_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id),
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, released, expired
    expires_at TIMESTAMP NOT NULL,
    released_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Audit logs สำหรับ tracking
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Report cache สำหรับ performance
CREATE TABLE IF NOT EXISTS report_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type VARCHAR(50) NOT NULL,
    period VARCHAR(20) NOT NULL,
    data JSONB NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

-- 5. Indexes สำหรับ performance
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_job_id ON transactions(job_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_payment_holds_job_id ON payment_holds(job_id);
CREATE INDEX idx_payment_holds_status ON payment_holds(status);

-- 6. Partition transactions table by month
CREATE TABLE transactions_y2024m01 PARTITION OF transactions
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE transactions_y2024m02 PARTITION OF transactions
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- 7. Views สำหรับ reporting
CREATE VIEW daily_earnings AS
SELECT 
    DATE(created_at) as date,
    SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_earnings,
    COUNT(*) as total_transactions,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_transactions
FROM transactions
GROUP BY DATE(created_at);

CREATE VIEW user_earnings_summary AS
SELECT 
    user_id,
    DATE_TRUNC('month', created_at) as month,
    SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as monthly_earnings,
    COUNT(*) as total_transactions
FROM transactions
GROUP BY user_id, DATE_TRUNC('month', created_at);