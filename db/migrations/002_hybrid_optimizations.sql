-- ============================================
-- HYBRID OPTIMIZATIONS V2.0
-- For 200,000+ users and 10M transactions/day
-- Run AFTER 001_initial_schema.sql
-- ============================================

-- Enable additional extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_partman" SCHEMA public; -- สำหรับ automatic partitioning

-- ============================================
-- 1. ADD SOFT DELETE และ OPTIMISTIC LOCKING
-- ============================================

-- Add deleted_at column to existing tables
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_verification_score INTEGER,
ADD COLUMN IF NOT EXISTS ai_verification_status VARCHAR(20),
ADD COLUMN IF NOT EXISTS ai_verified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS background_check_status VARCHAR(20),
ADD COLUMN IF NOT EXISTS background_check_risk_level VARCHAR(10),
ADD COLUMN IF NOT EXISTS daily_limit DECIMAL(12,2) DEFAULT 50000.00,
ADD COLUMN IF NOT EXISTS monthly_limit DECIMAL(12,2) DEFAULT 500000.00,
ADD COLUMN IF NOT EXISTS max_balance DECIMAL(12,2) DEFAULT 1000000.00;

ALTER TABLE kyc_documents 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_face_match_score INTEGER,
ADD COLUMN IF NOT EXISTS ai_document_quality_score INTEGER,
ADD COLUMN IF NOT EXISTS ai_liveness_score INTEGER,
ADD COLUMN IF NOT EXISTS ai_overall_score INTEGER,
ADD COLUMN IF NOT EXISTS ai_verification_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS ai_processed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS bg_check_passed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS bg_check_risk_level VARCHAR(10),
ADD COLUMN IF NOT EXISTS bg_check_verified_at TIMESTAMP;

ALTER TABLE user_skills 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;

ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;

-- ============================================
-- 2. RECREATE TRANSACTIONS TABLE WITH PARTITIONING
-- ============================================

-- First, backup existing transactions if any
CREATE TABLE IF NOT EXISTS transactions_backup AS SELECT * FROM transactions;

-- Drop old transactions table
DROP TABLE IF EXISTS transactions CASCADE;

-- Create new partitioned transactions table
CREATE TABLE transactions (
    id BIGSERIAL,
    transaction_id UUID DEFAULT uuid_generate_v4() UNIQUE,
    
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN (
        'deposit', 'withdraw', 'payment', 'refund', 
        'commission', 'bonus', 'adjustment', 'fee',
        'payment_received', 'payment_sent', 'cashback'
    )),
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'THB',
    
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'completed', 'failed', 
        'cancelled', 'refunded', 'reversed', 'on_hold'
    )),
    
    payment_method VARCHAR(50),
    payment_gateway VARCHAR(50),
    payment_reference VARCHAR(255),
    gateway_transaction_id VARCHAR(255),
    bank_account_number VARCHAR(20),
    bank_name VARCHAR(100),
    
    job_id UUID REFERENCES jobs(id),
    from_user_id UUID REFERENCES users(id),
    to_user_id UUID REFERENCES users(id),
    related_transaction_id UUID,
    
    fee_amount DECIMAL(12,2) DEFAULT 0.00,
    net_amount DECIMAL(12,2) GENERATED ALWAYS AS (amount - fee_amount) STORED,
    tax_amount DECIMAL(12,2) DEFAULT 0.00,
    
    ip_address INET,
    user_agent TEXT,
    device_id VARCHAR(255),
    
    description TEXT,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    completed_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    version INTEGER DEFAULT 0,
    
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create partitions for current and next 3 months
CREATE TABLE transactions_y2024m01 PARTITION OF transactions
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE transactions_y2024m02 PARTITION OF transactions
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

CREATE TABLE transactions_y2024m03 PARTITION OF transactions
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');

CREATE TABLE transactions_y2024m04 PARTITION OF transactions
    FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');

-- Restore data from backup
INSERT INTO transactions (
    transaction_id, user_id, type, amount, currency, status,
    payment_method, payment_reference, job_id, from_user_id, to_user_id,
    description, metadata, created_at, completed_at
)
SELECT 
    id, user_id, type, amount, currency, status,
    payment_method, payment_reference, job_id, from_user_id, to_user_id,
    description, metadata, created_at, completed_at
FROM transactions_backup;

-- Drop backup table
DROP TABLE IF EXISTS transactions_backup;

-- ============================================
-- 3. CREATE WALLET SNAPSHOTS TABLE
-- ============================================
CREATE TABLE wallet_snapshots (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    opening_balance DECIMAL(12,2) NOT NULL,
    closing_balance DECIMAL(12,2) NOT NULL,
    total_deposits DECIMAL(12,2) DEFAULT 0.00,
    total_withdrawals DECIMAL(12,2) DEFAULT 0.00,
    total_fees DECIMAL(12,2) DEFAULT 0.00,
    total_taxes DECIMAL(12,2) DEFAULT 0.00,
    
    deposit_count INTEGER DEFAULT 0,
    withdrawal_count INTEGER DEFAULT 0,
    payment_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    
    snapshot_date DATE NOT NULL,
    snapshot_type VARCHAR(20) DEFAULT 'daily' CHECK (snapshot_type IN ('daily', 'monthly', 'yearly')),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    calculation_duration_ms INTEGER,
    
    UNIQUE(user_id, snapshot_date, snapshot_type)
);

-- ============================================
-- 4. ENHANCE AUDIT LOGS WITH PARTITIONING
-- ============================================

-- Backup existing audit logs
CREATE TABLE IF NOT EXISTS admin_logs_backup AS SELECT * FROM admin_logs;

-- Drop old table
DROP TABLE IF EXISTS admin_logs CASCADE;

-- Create new partitioned audit logs
CREATE TABLE audit_logs (
    id BIGSERIAL,
    log_id UUID DEFAULT uuid_generate_v4(),
    
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(255) NOT NULL,
    operation VARCHAR(10) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    
    old_values JSONB,
    new_values JSONB,
    diff JSONB GENERATED ALWAYS AS (
        CASE 
            WHEN old_values IS NULL THEN new_values
            WHEN new_values IS NULL THEN old_values
            ELSE (
                SELECT jsonb_object_agg(
                    key, 
                    jsonb_build_object('old', old_values->key, 'new', new_values->key)
                )
                FROM (
                    SELECT key FROM jsonb_object_keys(old_values)
                    UNION
                    SELECT key FROM jsonb_object_keys(new_values)
                ) AS keys(key)
                WHERE old_values->key IS DISTINCT FROM new_values->key
            )
        END
    ) STORED,
    
    changed_by UUID REFERENCES users(id),
    changed_by_firebase_uid VARCHAR(255),
    changed_by_ip INET,
    
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id, changed_at)
) PARTITION BY RANGE (changed_at);

-- Create partitions for audit logs
CREATE TABLE audit_logs_y2024m01 PARTITION OF audit_logs
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE audit_logs_y2024m02 PARTITION OF audit_logs
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Restore data
INSERT INTO audit_logs (
    log_id, table_name, record_id, operation, old_values, new_values,
    changed_by, changed_at
)
SELECT 
    id, 'unknown', resource_id, 'UPDATE', old_values, new_values,
    admin_id, created_at
FROM admin_logs_backup;

DROP TABLE IF EXISTS admin_logs_backup;

-- ============================================
-- 5. CREATE ADDITIONAL INDEXES FOR PERFORMANCE
-- ============================================

-- Users table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) 
    WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_wallet_balance ON users(wallet_balance DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_kyc_level ON users(kyc_level);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_ai_score ON users(ai_verification_score DESC NULLS LAST);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_month ON users(DATE_TRUNC('month', created_at));

-- KYC documents indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kyc_document_hash ON kyc_documents(document_hash)
    WHERE document_hash IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kyc_ai_overall_score ON kyc_documents(ai_overall_score DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kyc_bg_check ON kyc_documents(bg_check_passed, bg_check_risk_level);

-- Transactions indexes (optimized for 10M/day)
CREATE INDEX CONCURRENTLY idx_transactions_user_id ON transactions(user_id);
CREATE INDEX CONCURRENTLY idx_transactions_status ON transactions(status);
CREATE INDEX CONCURRENTLY idx_transactions_type ON transactions(type);
CREATE INDEX CONCURRENTLY idx_transactions_payment_ref ON transactions(payment_reference) 
    WHERE payment_reference IS NOT NULL;
CREATE INDEX CONCURRENTLY idx_transactions_gateway_id ON transactions(gateway_transaction_id) 
    WHERE gateway_transaction_id IS NOT NULL;
CREATE INDEX CONCURRENTLY idx_transactions_user_status ON transactions(user_id, status, created_at DESC);
CREATE INDEX CONCURRENTLY idx_transactions_user_date ON transactions(user_id, created_at DESC);
CREATE INDEX CONCURRENTLY idx_transactions_completed_date ON transactions(status, completed_at DESC) 
    WHERE status = 'completed';
CREATE INDEX CONCURRENTLY idx_transactions_created_brin ON transactions USING BRIN (created_at);
CREATE INDEX CONCURRENTLY idx_transactions_amount_range ON transactions(amount) WHERE amount > 10000;

-- Jobs table additional indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_deadline ON jobs(deadline) 
    WHERE deadline > CURRENT_TIMESTAMP AND status = 'open';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_budget_range ON jobs(budget_amount) 
    WHERE status = 'open' AND budget_amount BETWEEN 100 AND 10000;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_location_radius ON jobs 
    USING GIST (ll_to_earth(latitude, longitude));

-- Wallet snapshots indexes
CREATE INDEX CONCURRENTLY idx_snapshots_user_date ON wallet_snapshots(user_id, snapshot_date DESC);
CREATE INDEX CONCURRENTLY idx_snapshots_date ON wallet_snapshots(snapshot_date DESC);
CREATE INDEX CONCURRENTLY idx_snapshots_type ON wallet_snapshots(snapshot_type);

-- Audit logs indexes
CREATE INDEX CONCURRENTLY idx_audit_table_record ON audit_logs(table_name, record_id);
CREATE INDEX CONCURRENTLY idx_audit_changed_at ON audit_logs(changed_at DESC);
CREATE INDEX CONCURRENTLY idx_audit_changed_by ON audit_logs(changed_by);
CREATE INDEX CONCURRENTLY idx_audit_operation ON audit_logs(operation);
CREATE INDEX CONCURRENTLY idx_audit_brin ON audit_logs USING BRIN (changed_at);

-- ============================================
-- 6. CREATE PERFORMANCE FUNCTIONS
-- ============================================

-- Function for atomic balance update with KYC checks
CREATE OR REPLACE FUNCTION process_transaction(
    p_user_id UUID,
    p_amount DECIMAL(12,2),
    p_transaction_type VARCHAR(20),
    p_payment_method VARCHAR(50) DEFAULT NULL,
    p_description TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_user_record users%ROWTYPE;
    v_daily_used DECIMAL(12,2);
    v_transaction_id UUID;
    v_old_balance DECIMAL(12,2);
    v_new_balance DECIMAL(12,2);
    v_result JSONB;
BEGIN
    -- Lock user for update
    SELECT * INTO v_user_record 
    FROM users 
    WHERE id = p_user_id AND deleted_at IS NULL
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found or deleted';
    END IF;
    
    -- Check KYC status for financial transactions
    IF p_transaction_type IN ('withdraw', 'payment_sent') AND 
       v_user_record.kyc_status NOT IN ('ai_verified', 'verified', 'admin_approved') THEN
        RAISE EXCEPTION 'KYC verification required for this transaction';
    END IF;
    
    -- Check daily limit for withdrawals
    IF p_transaction_type = 'withdraw' THEN
        SELECT COALESCE(SUM(amount), 0)
        INTO v_daily_used
        FROM transactions
        WHERE user_id = p_user_id
            AND type = 'withdraw'
            AND status = 'completed'
            AND DATE(completed_at) = CURRENT_DATE;
        
        IF v_daily_used + p_amount > v_user_record.daily_limit THEN
            RAISE EXCEPTION 'Daily limit exceeded. Used: %, Limit: %', 
                v_daily_used, v_user_record.daily_limit;
        END IF;
    END IF;
    
    -- Calculate new balance
    v_old_balance := v_user_record.wallet_balance;
    
    IF p_transaction_type IN ('deposit', 'payment_received', 'refund', 'bonus', 'cashback') THEN
        v_new_balance := v_old_balance + p_amount;
    ELSIF p_transaction_type IN ('withdraw', 'payment_sent', 'fee', 'commission') THEN
        IF v_old_balance < p_amount THEN
            RAISE EXCEPTION 'Insufficient balance. Available: %, Requested: %', 
                v_old_balance, p_amount;
        END IF;
        v_new_balance := v_old_balance - p_amount;
    ELSE
        RAISE EXCEPTION 'Invalid transaction type';
    END IF;
    
    -- Update user balance
    UPDATE users 
    SET wallet_balance = v_new_balance,
        updated_at = CURRENT_TIMESTAMP,
        version = version + 1
    WHERE id = p_user_id;
    
    -- Create transaction record
    INSERT INTO transactions (
        transaction_id, user_id, type, amount, status,
        payment_method, description, completed_at
    ) VALUES (
        uuid_generate_v4(),
        p_user_id,
        p_transaction_type,
        p_amount,
        'completed',
        p_payment_method,
        p_description,
        CURRENT_TIMESTAMP
    ) RETURNING transaction_id INTO v_transaction_id;
    
    -- Return result
    v_result := jsonb_build_object(
        'success', true,
        'transaction_id', v_transaction_id,
        'old_balance', v_old_balance,
        'new_balance', v_new_balance,
        'amount', p_amount,
        'type', p_transaction_type,
        'daily_used', COALESCE(v_daily_used, 0),
        'daily_limit', v_user_record.daily_limit,
        'kyc_level', v_user_record.kyc_level,
        'timestamp', CURRENT_TIMESTAMP
    );
    
    RETURN v_result;
    
EXCEPTION WHEN OTHERS THEN
    -- Log error
    INSERT INTO audit_logs (table_name, record_id, operation, new_values)
    VALUES ('transactions', p_user_id::text, 'ERROR', 
            jsonb_build_object('error', SQLERRM, 'transaction_type', p_transaction_type));
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- Function for daily wallet snapshot
CREATE OR REPLACE FUNCTION create_daily_wallet_snapshot()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    INSERT INTO wallet_snapshots (
        user_id, snapshot_date, snapshot_type,
        opening_balance, closing_balance,
        total_deposits, total_withdrawals, total_fees,
        deposit_count, withdrawal_count, payment_count
    )
    SELECT 
        u.id,
        CURRENT_DATE - 1,
        'daily',
        COALESCE((
            SELECT closing_balance 
            FROM wallet_snapshots ws 
            WHERE ws.user_id = u.id 
            AND ws.snapshot_date = CURRENT_DATE - 2
            ORDER BY created_at DESC LIMIT 1
        ), 0.00) as opening_balance,
        
        u.wallet_balance as closing_balance,
        
        COALESCE(SUM(
            CASE WHEN t.type IN ('deposit', 'refund', 'bonus', 'cashback') THEN t.amount ELSE 0 END
        ), 0.00) as total_deposits,
        
        COALESCE(SUM(
            CASE WHEN t.type IN ('withdraw', 'fee', 'commission') THEN t.amount ELSE 0 END
        ), 0.00) as total_withdrawals,
        
        COALESCE(SUM(
            CASE WHEN t.type = 'fee' THEN t.amount ELSE 0 END
        ), 0.00) as total_fees,
        
        COUNT(CASE WHEN t.type IN ('deposit', 'refund', 'bonus', 'cashback') THEN 1 END) as deposit_count,
        COUNT(CASE WHEN t.type IN ('withdraw', 'fee', 'commission') THEN 1 END) as withdrawal_count,
        COUNT(CASE WHEN t.type IN ('payment', 'payment_received', 'payment_sent') THEN 1 END) as payment_count
        
    FROM users u
    LEFT JOIN transactions t ON t.user_id = u.id 
        AND t.status = 'completed'
        AND DATE(t.completed_at) = CURRENT_DATE - 1
    WHERE u.deleted_at IS NULL
    GROUP BY u.id, u.wallet_balance
    ON CONFLICT (user_id, snapshot_date, snapshot_type) 
    DO UPDATE SET
        closing_balance = EXCLUDED.closing_balance,
        total_deposits = EXCLUDED.total_deposits,
        total_withdrawals = EXCLUDED.total_withdrawals,
        total_fees = EXCLUDED.total_fees,
        deposit_count = EXCLUDED.deposit_count,
        withdrawal_count = EXCLUDED.withdrawal_count,
        payment_count = EXCLUDED.payment_count,
        created_at = CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get user financial summary
CREATE OR REPLACE FUNCTION get_user_financial_summary(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'user_id', u.id,
        'email', u.email,
        'full_name', u.full_name,
        'kyc_status', u.kyc_status,
        'kyc_level', u.kyc_level,
        'current_balance', u.wallet_balance,
        'daily_limit', u.daily_limit,
        'monthly_limit', u.monthly_limit,
        'total_earnings', u.total_earnings,
        'today_stats', today_stats,
        'this_month_stats', month_stats,
        'last_snapshot', last_snapshot
    ) INTO v_result
    FROM users u
    LEFT JOIN LATERAL (
        SELECT jsonb_build_object(
            'deposits', COALESCE(SUM(CASE WHEN type IN ('deposit', 'refund', 'bonus') THEN amount ELSE 0 END), 0),
            'withdrawals', COALESCE(SUM(CASE WHEN type IN ('withdraw', 'fee', 'commission') THEN amount ELSE 0 END), 0),
            'transaction_count', COUNT(*)
        ) as today_stats
        FROM transactions t
        WHERE t.user_id = u.id 
            AND t.status = 'completed'
            AND DATE(t.completed_at) = CURRENT_DATE
    ) today ON true
    LEFT JOIN LATERAL (
        SELECT jsonb_build_object(
            'deposits', COALESCE(SUM(CASE WHEN type IN ('deposit', 'refund', 'bonus') THEN amount ELSE 0 END), 0),
            'withdrawals', COALESCE(SUM(CASE WHEN type IN ('withdraw', 'fee', 'commission') THEN amount ELSE 0 END), 0),
            'transaction_count', COUNT(*)
        ) as month_stats
        FROM transactions t
        WHERE t.user_id = u.id 
            AND t.status = 'completed'
            AND DATE_TRUNC('month', t.completed_at) = DATE_TRUNC('month', CURRENT_DATE)
    ) month ON true
    LEFT JOIN LATERAL (
        SELECT jsonb_build_object(
            'balance', ws.closing_balance,
            'date', ws.snapshot_date,
            'deposits', ws.total_deposits
        ) as last_snapshot
        FROM wallet_snapshots ws
        WHERE ws.user_id = u.id
        ORDER BY ws.snapshot_date DESC
        LIMIT 1
    ) ws ON true
    WHERE u.id = p_user_id AND u.deleted_at IS NULL;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. CREATE REPORTING VIEWS
-- ============================================

-- KYC Verification Dashboard
CREATE OR REPLACE VIEW kyc_verification_dashboard AS
SELECT 
    DATE_TRUNC('day', kd.submitted_at) as submission_date,
    COUNT(*) as total_submissions,
    COUNT(CASE WHEN kd.verification_status = 'verified' THEN 1 END) as approved,
    COUNT(CASE WHEN kd.verification_status = 'rejected' THEN 1 END) as rejected,
    COUNT(CASE WHEN kd.verification_status = 'pending' THEN 1 END) as pending,
    AVG(kd.ai_overall_score) as avg_ai_score,
    COUNT(CASE WHEN kd.bg_check_passed = TRUE THEN 1 END) as bg_check_passed,
    COUNT(CASE WHEN kd.bg_check_risk_level = 'high' THEN 1 END) as high_risk
FROM kyc_documents kd
WHERE kd.submitted_at >= CURRENT_DATE - 30
GROUP BY DATE_TRUNC('day', kd.submitted_at)
ORDER BY submission_date DESC;

-- Daily Transactions Report
CREATE OR REPLACE VIEW daily_transactions_report AS
SELECT 
    DATE(t.created_at) as transaction_date,
    t.type,
    COUNT(*) as count,
    SUM(t.amount) as total_amount,
    SUM(t.fee_amount) as total_fees,
    COUNT(DISTINCT t.user_id) as unique_users,
    COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed,
    COUNT(CASE WHEN t.status = 'failed' THEN 1 END) as failed
FROM transactions t
WHERE t.created_at >= CURRENT_DATE - 7
GROUP BY DATE(t.created_at), t.type
ORDER BY transaction_date DESC, total_amount DESC;

-- User Wallet Health View
CREATE OR REPLACE VIEW user_wallet_health AS
SELECT 
    u.id,
    u.email,
    u.full_name,
    u.kyc_level,
    u.wallet_balance,
    u.daily_limit,
    u.monthly_limit,
    COALESCE(today.withdrawal_today, 0) as withdrawal_today,
    COALESCE(monthly.withdrawal_month, 0) as withdrawal_month,
    CASE 
        WHEN u.wallet_balance <= 0 THEN 'empty'
        WHEN u.wallet_balance < 100 THEN 'low'
        WHEN u.wallet_balance > u.max_balance * 0.8 THEN 'high'
        ELSE 'normal'
    END as balance_status,
    CASE 
        WHEN COALESCE(today.withdrawal_today, 0) > u.daily_limit * 0.8 THEN 'near_daily_limit'
        WHEN COALESCE(monthly.withdrawal_month, 0) > u.monthly_limit * 0.8 THEN 'near_monthly_limit'
        ELSE 'ok'
    END as limit_status
FROM users u
LEFT JOIN LATERAL (
    SELECT SUM(amount) as withdrawal_today
    FROM transactions t
    WHERE t.user_id = u.id
        AND t.type = 'withdraw'
        AND t.status = 'completed'
        AND DATE(t.completed_at) = CURRENT_DATE
) today ON true
LEFT JOIN LATERAL (
    SELECT SUM(amount) as withdrawal_month
    FROM transactions t
    WHERE t.user_id = u.id
        AND t.type = 'withdraw'
        AND t.status = 'completed'
        AND DATE_TRUNC('month', t.completed_at) = DATE_TRUNC('month', CURRENT_DATE)
) monthly ON true
WHERE u.deleted_at IS NULL
ORDER BY u.wallet_balance DESC;

-- ============================================
-- 8. CREATE SCHEDULED MAINTENANCE FUNCTIONS
-- ============================================

-- Function to create next month partitions
CREATE OR REPLACE FUNCTION create_next_month_partitions()
RETURNS VOID AS $$
DECLARE
    next_month TEXT;
    next_month_start DATE;
    next_month_end DATE;
BEGIN
    next_month := TO_CHAR(CURRENT_DATE + INTERVAL '1 month', 'YYYYmMM');
    next_month_start := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month');
    next_month_end := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '2 months');
    
    -- Create transactions partition
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS transactions_y%s PARTITION OF transactions
        FOR VALUES FROM (%L) TO (%L)',
        next_month, next_month_start, next_month_end
    );
    
    -- Create audit logs partition
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS audit_logs_y%s PARTITION OF audit_logs
        FOR VALUES FROM (%L) TO (%L)',
        next_month, next_month_start, next_month_end
    );
    
    RAISE NOTICE 'Created partitions for %', next_month;
END;
$$ LANGUAGE plpgsql;

-- Function to archive old data (keep only 13 months)
CREATE OR REPLACE FUNCTION archive_old_data()
RETURNS INTEGER AS $$
DECLARE
    archive_date DATE;
    archived_count INTEGER;
BEGIN
    archive_date := CURRENT_DATE - INTERVAL '13 months';
    
    -- Archive old transactions (you might want to move to cold storage)
    -- This example just deletes, but you should archive first
    DELETE FROM transactions 
    WHERE created_at < archive_date
    RETURNING COUNT(*) INTO archived_count;
    
    -- Archive old audit logs
    DELETE FROM audit_logs 
    WHERE changed_at < archive_date;
    
    RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 9. SETUP CRON JOBS (ใช้ pg_cron extension)
-- ============================================
-- ต้องติดตั้ง pg_cron ก่อน: CREATE EXTENSION pg_cron;

-- รันทุกวัน ตอน 01:00
-- SELECT cron.schedule('daily-snapshot', '0 1 * * *', 'SELECT create_daily_wallet_snapshot();');

-- รันทุกเดือนแรกของเดือน ตอน 02:00
-- SELECT cron.schedule('create-partitions', '0 2 1 * *', 'SELECT create_next_month_partitions();');

-- รันทุก 3 เดือน ตอน 03:00
-- SELECT cron.schedule('archive-data', '0 3 1 */3 *', 'SELECT archive_old_data();');

-- ============================================
-- 10. FINAL COMMENTS
-- ============================================
COMMENT ON FUNCTION process_transaction IS 'Atomic transaction processing with KYC and limit checks';
COMMENT ON FUNCTION create_daily_wallet_snapshot IS 'Creates daily wallet balance snapshots for auditing';
COMMENT ON FUNCTION get_user_financial_summary IS 'Returns comprehensive financial summary for a user';
COMMENT ON FUNCTION create_next_month_partitions IS 'Creates partitions for next month automatically';
COMMENT ON FUNCTION archive_old_data IS 'Archives data older than 13 months';

COMMENT ON VIEW kyc_verification_dashboard IS 'Daily KYC verification statistics';
COMMENT ON VIEW daily_transactions_report IS 'Daily transaction volume and statistics';
COMMENT ON VIEW user_wallet_health IS 'User wallet health and limit monitoring';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================