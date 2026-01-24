CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- เพิ่ม extension นี้สำหรับ cryptographic functions

-- ============================================
-- 1. USERS TABLE - ปรับปรุงเพิ่มเติม
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firebase_uid VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255),
    
    -- Basic Info
    full_name VARCHAR(255),
    date_of_birth DATE,
    id_card_number VARCHAR(13),
    
    -- Status
    kyc_status VARCHAR(20) DEFAULT 'pending', -- pending, verified, rejected, ai_verified, ai_failed
    kyc_level VARCHAR(10) DEFAULT 'level_1', -- level_1, level_2, level_3
    account_status VARCHAR(20) DEFAULT 'active', -- active, suspended, banned
    is_deleted BOOLEAN DEFAULT FALSE, -- เพิ่ม soft delete flag ✅
    
    -- Wallet
    wallet_balance DECIMAL(12,2) DEFAULT 0.00,
    wallet_pending DECIMAL(12,2) DEFAULT 0.00,
    
    -- Financial Limits (เพิ่มสำหรับ KYC levels) ✅
    daily_limit DECIMAL(12,2) DEFAULT 50000.00,
    monthly_limit DECIMAL(12,2) DEFAULT 500000.00,
    max_balance DECIMAL(12,2) DEFAULT 1000000.00,
    
    -- Stats
    total_earnings DECIMAL(12,2) DEFAULT 0.00,
    total_jobs INTEGER DEFAULT 0,
    rating DECIMAL(3,2) DEFAULT 0.00,
    
    -- KYC AI Verification Results (เพิ่ม) ✅
    ai_verification_score INTEGER,
    ai_verification_status VARCHAR(20),
    ai_verified_at TIMESTAMP,
    background_check_status VARCHAR(20),
    background_check_risk_level VARCHAR(10),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP,
    deleted_at TIMESTAMP, -- เพิ่มสำหรับ soft delete ✅
    
    -- Version สำหรับ optimistic locking ✅
    version INTEGER DEFAULT 0,
    
    -- Constraints
    CONSTRAINT chk_kyc_status CHECK (kyc_status IN (
        'not_submitted', 'pending', 'ai_verified', 'ai_failed', 
        'verified', 'rejected', 'under_review'
    )),
    CONSTRAINT chk_kyc_level CHECK (kyc_level IN ('level_1', 'level_2', 'level_3')),
    CONSTRAINT chk_account_status CHECK (account_status IN ('active', 'suspended', 'banned'))
);

-- เพิ่ม Indexes ใหม่ ✅
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_wallet_balance ON users(wallet_balance DESC);
CREATE INDEX idx_users_kyc_level ON users(kyc_level);
CREATE INDEX idx_users_ai_score ON users(ai_verification_score DESC NULLS LAST);

-- ============================================
-- 2. KYC DOCUMENTS TABLE - ปรับปรุงเพิ่มเติม
-- ============================================
CREATE TABLE kyc_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    firebase_uid VARCHAR(255) REFERENCES users(firebase_uid),
    
    full_name VARCHAR(255) NOT NULL,
    id_card_number VARCHAR(13) NOT NULL,
    birth_date DATE NOT NULL,
    document_type VARCHAR(50), -- id_front, id_back, selfie, dl_front, dl_back
    document_url TEXT, -- URL ไปยัง storage (Cloudinary)
    document_hash VARCHAR(64), -- SHA256 hash สำหรับ deduplication
    file_size_kb INTEGER,
    
    -- AI Verification Results (เพิ่ม detail) ✅
    ai_face_match_score INTEGER,
    ai_document_quality_score INTEGER,
    ai_liveness_score INTEGER,
    ai_overall_score INTEGER,
    ai_verification_id VARCHAR(255),
    ai_processed_at TIMESTAMP,
    
    -- Background Check Results (เพิ่ม) ✅
    bg_check_passed BOOLEAN DEFAULT FALSE,
    bg_check_risk_level VARCHAR(10),
    bg_check_verified_at TIMESTAMP,
    
    -- Verification
    verification_status VARCHAR(20) DEFAULT 'pending', -- pending, verified, rejected
    verified_by UUID REFERENCES users(id), -- Admin user ID
    verified_at TIMESTAMP,
    rejection_reason TEXT,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE, -- เพิ่ม soft delete ✅
    
    -- Version สำหรับ optimistic locking ✅
    version INTEGER DEFAULT 0,
    
    -- Indexes
    INDEX idx_kyc_user_id (user_id),
    INDEX idx_kyc_status (verification_status),
    INDEX idx_kyc_submitted_at (submitted_at DESC),
    INDEX idx_kyc_ai_score (ai_overall_score DESC NULLS LAST), -- ✅
    INDEX idx_kyc_document_hash (document_hash) WHERE document_hash IS NOT NULL -- ✅
);

-- ============================================
-- 3. TRANSACTIONS TABLE - ปรับปรุงใหม่ทั้งหมด ✅
-- ============================================
-- ลบ table เดิม (ถ้ามี)
DROP TABLE IF EXISTS transactions CASCADE;

-- สร้างใหม่แบบ optimized
CREATE TABLE transactions (
    -- ใช้ BIGSERIAL แทน UUID สำหรับ performance
    id BIGSERIAL,
    
    -- Business ID (สำหรับ external reference)
    transaction_id UUID DEFAULT uuid_generate_v4() UNIQUE,
    
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN (
        'deposit', 'withdraw', 'payment', 'refund', 
        'commission', 'bonus', 'adjustment', 'fee',
        'payment_received', 'payment_sent'
    )),
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'THB',
    
    -- Status tracking (เพิ่ม state machine)
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'completed', 'failed', 
        'cancelled', 'refunded', 'reversed', 'on_hold'
    )),
    
    -- Payment info
    payment_method VARCHAR(50),
    payment_gateway VARCHAR(50),
    payment_reference VARCHAR(255),
    gateway_transaction_id VARCHAR(255),
    bank_account_number VARCHAR(20),
    bank_name VARCHAR(100),
    
    -- Related entities
    job_id UUID REFERENCES jobs(id),
    from_user_id UUID REFERENCES users(id),
    to_user_id UUID REFERENCES users(id),
    related_transaction_id UUID, -- สำหรับ refunds/reversals
    
    -- Financial tracking
    fee_amount DECIMAL(12,2) DEFAULT 0.00,
    net_amount DECIMAL(12,2) GENERATED ALWAYS AS (amount - fee_amount) STORED,
    tax_amount DECIMAL(12,2) DEFAULT 0.00,
    
    -- Audit info
    ip_address INET,
    user_agent TEXT,
    device_id VARCHAR(255),
    
    -- Metadata
    description TEXT,
    notes TEXT, -- สำหรับ admin notes
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    completed_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    -- Concurrency control
    version INTEGER DEFAULT 0,
    
    -- Primary key on id สำหรับ partitioning
    PRIMARY KEY (id, created_at)
    
) PARTITION BY RANGE (created_at); -- ✅ เพิ่ม partitioning

-- สร้าง partition สำหรับเดือนปัจจุบัน ✅
CREATE TABLE transactions_y2024m01 PARTITION OF transactions
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- ============================================
-- 4. WALLET SNAPSHOTS TABLE (ใหม่) ✅
-- ============================================
CREATE TABLE wallet_snapshots (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Balances
    opening_balance DECIMAL(12,2) NOT NULL,
    closing_balance DECIMAL(12,2) NOT NULL,
    total_deposits DECIMAL(12,2) DEFAULT 0.00,
    total_withdrawals DECIMAL(12,2) DEFAULT 0.00,
    total_fees DECIMAL(12,2) DEFAULT 0.00,
    total_taxes DECIMAL(12,2) DEFAULT 0.00,
    
    -- Transaction counts
    deposit_count INTEGER DEFAULT 0,
    withdrawal_count INTEGER DEFAULT 0,
    payment_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    
    -- Period
    snapshot_date DATE NOT NULL,
    snapshot_type VARCHAR(20) DEFAULT 'daily' CHECK (snapshot_type IN ('daily', 'monthly', 'yearly')),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    calculation_duration_ms INTEGER, -- เวลาที่ใช้คำนวณ
    
    -- Ensure one snapshot per user per day
    UNIQUE(user_id, snapshot_date, snapshot_type),
    
    -- Indexes
    INDEX idx_snapshots_user_date (user_id, snapshot_date DESC),
    INDEX idx_snapshots_date (snapshot_date DESC),
    INDEX idx_snapshots_type (snapshot_type)
);

-- ============================================
-- 5. AUDIT LOGS TABLE (ใหม่) ✅
-- ============================================
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(255) NOT NULL,
    operation VARCHAR(10) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    
    -- What changed
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
    
    -- Who changed it
    changed_by UUID REFERENCES users(id),
    changed_by_firebase_uid VARCHAR(255),
    changed_by_ip INET,
    
    -- When
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for fast querying
    INDEX idx_audit_table_record (table_name, record_id),
    INDEX idx_audit_changed_at (changed_at DESC),
    INDEX idx_audit_changed_by (changed_by),
    INDEX idx_audit_operation (operation)
) PARTITION BY RANGE (changed_at);

-- สร้าง partition สำหรับ audit logs ✅
CREATE TABLE audit_logs_y2024m01 PARTITION OF audit_logs
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- ============================================
-- 6. USER SKILLS TABLE - คงเดิม (เพิ่ม soft delete)
-- ============================================
CREATE TABLE user_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    skill_name VARCHAR(100) NOT NULL,
    skill_category VARCHAR(50),
    
    -- Certification
    is_certified BOOLEAN DEFAULT FALSE,
    certification_id VARCHAR(100),
    certified_at TIMESTAMP,
    certified_by UUID REFERENCES users(id),
    
    -- Stats
    total_jobs INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2) DEFAULT 0.00,
    avg_rating DECIMAL(3,2) DEFAULT 0.00,
    
    -- Timestamps & soft delete
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    -- Version
    version INTEGER DEFAULT 0,
    
    UNIQUE(user_id, skill_name),
    INDEX idx_skills_user_id (user_id),
    INDEX idx_skills_category (skill_category),
    INDEX idx_skills_certified (is_certified) WHERE is_certified = TRUE
);

-- ============================================
-- 7. JOBS TABLE - คงเดิม (เพิ่ม indexing)
-- ============================================
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Job Info
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    subcategory VARCHAR(100),
    
    -- Location
    location_text TEXT,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    
    -- Pricing
    budget_type VARCHAR(20), -- fixed, hourly, negotiable
    budget_amount DECIMAL(12,2),
    currency VARCHAR(3) DEFAULT 'THB',
    
    -- Status
    status VARCHAR(20) DEFAULT 'open', -- open, in_progress, completed, cancelled
    priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
    
    -- Timeline
    posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    deadline TIMESTAMP,
    
    -- Relationships
    client_id UUID REFERENCES users(id), -- ผู้จ้างงาน
    provider_id UUID REFERENCES users(id), -- ผู้รับงาน
    
    -- Stats
    view_count INTEGER DEFAULT 0,
    proposal_count INTEGER DEFAULT 0,
    
    -- Metadata & soft delete
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    -- Version
    version INTEGER DEFAULT 0,
    
    -- Indexes (เพิ่มเติม)
    INDEX idx_jobs_status (status),
    INDEX idx_jobs_category (category),
    INDEX idx_jobs_client_id (client_id),
    INDEX idx_jobs_provider_id (provider_id),
    INDEX idx_jobs_posted_at (posted_at),
    INDEX idx_jobs_location (latitude, longitude),
    INDEX idx_jobs_budget (budget_amount) WHERE status = 'open', -- ✅
    INDEX idx_jobs_deadline (deadline) WHERE deadline > CURRENT_TIMESTAMP -- ✅
);

-- ============================================
-- 8. FUNCTIONS และ TRIGGERS (ใหม่) ✅
-- ============================================

-- Function สำหรับ auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ language plpgsql;

-- Function สำหรับ audit logging
CREATE OR REPLACE FUNCTION log_audit_trail()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_logs (table_name, record_id, operation, old_values, changed_at)
        VALUES (TG_TABLE_NAME, OLD.id::text, TG_OP, to_jsonb(OLD), CURRENT_TIMESTAMP);
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_logs (table_name, record_id, operation, old_values, new_values, changed_at)
        VALUES (TG_TABLE_NAME, NEW.id::text, TG_OP, to_jsonb(OLD), to_jsonb(NEW), CURRENT_TIMESTAMP);
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_logs (table_name, record_id, operation, new_values, changed_at)
        VALUES (TG_TABLE_NAME, NEW.id::text, TG_OP, to_jsonb(NEW), CURRENT_TIMESTAMP);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Function สำหรับ update balance (atomic operation)
CREATE OR REPLACE FUNCTION update_user_balance(
    p_user_id UUID,
    p_amount DECIMAL(12,2),
    p_transaction_type VARCHAR(20),
    p_reference_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_old_balance DECIMAL(12,2);
    v_new_balance DECIMAL(12,2);
    v_transaction_id UUID;
    v_kyc_level VARCHAR(10);
    v_daily_used DECIMAL(12,2);
    v_daily_limit DECIMAL(12,2);
    v_result JSONB;
BEGIN
    -- Start transaction
    BEGIN
        -- Lock user row for update
        SELECT wallet_balance, kyc_level, daily_limit 
        INTO v_old_balance, v_kyc_level, v_daily_limit
        FROM users 
        WHERE id = p_user_id 
        FOR UPDATE;
        
        -- Check daily limit สำหรับการถอน
        IF p_transaction_type = 'withdraw' THEN
            SELECT COALESCE(SUM(amount), 0)
            INTO v_daily_used
            FROM transactions
            WHERE user_id = p_user_id
                AND type = 'withdraw'
                AND status = 'completed'
                AND DATE(completed_at) = CURRENT_DATE;
            
            IF v_daily_used + p_amount > v_daily_limit THEN
                RAISE EXCEPTION 'Daily withdrawal limit exceeded. Used: %, Limit: %, Requested: %', 
                    v_daily_used, v_daily_limit, p_amount;
            END IF;
        END IF;
        
        -- Calculate new balance
        IF p_transaction_type IN ('deposit', 'payment_received', 'refund', 'bonus') THEN
            v_new_balance := v_old_balance + p_amount;
        ELSIF p_transaction_type IN ('withdraw', 'payment_sent', 'fee', 'commission') THEN
            -- Check sufficient balance
            IF v_old_balance < p_amount THEN
                RAISE EXCEPTION 'Insufficient balance. Available: %, Requested: %', 
                    v_old_balance, p_amount;
            END IF;
            v_new_balance := v_old_balance - p_amount;
        ELSE
            RAISE EXCEPTION 'Invalid transaction type: %', p_transaction_type;
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
            payment_reference, completed_at
        ) VALUES (
            COALESCE(p_reference_id, uuid_generate_v4()),
            p_user_id,
            p_transaction_type,
            p_amount,
            'completed',
            p_reference_id::text,
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
            'daily_used', v_daily_used,
            'daily_limit', v_daily_limit,
            'timestamp', CURRENT_TIMESTAMP
        );
        
        RETURN v_result;
        
    EXCEPTION WHEN OTHERS THEN
        RAISE;
    END;
END;
$$ LANGUAGE plpgsql;

-- Function สำหรับสร้าง daily snapshot
CREATE OR REPLACE FUNCTION create_daily_wallet_snapshot()
RETURNS VOID AS $$
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
            CASE WHEN t.type IN ('deposit', 'refund', 'bonus') THEN t.amount ELSE 0 END
        ), 0.00) as total_deposits,
        
        COALESCE(SUM(
            CASE WHEN t.type IN ('withdraw', 'fee', 'commission') THEN t.amount ELSE 0 END
        ), 0.00) as total_withdrawals,
        
        COALESCE(SUM(
            CASE WHEN t.type = 'fee' THEN t.amount ELSE 0 END
        ), 0.00) as total_fees,
        
        COUNT(CASE WHEN t.type IN ('deposit', 'refund', 'bonus') THEN 1 END) as deposit_count,
        COUNT(CASE WHEN t.type IN ('withdraw', 'fee', 'commission') THEN 1 END) as withdrawal_count,
        COUNT(CASE WHEN t.type IN ('payment', 'payment_received') THEN 1 END) as payment_count
        
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
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 9. TRIGGERS (เพิ่มให้กับ tables หลัก)
-- ============================================

-- Triggers สำหรับ users
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER audit_users
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION log_audit_trail();

-- Triggers สำหรับ transactions
CREATE TRIGGER update_transactions_updated_at 
    BEFORE UPDATE ON transactions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Triggers สำหรับ kyc_documents
CREATE TRIGGER update_kyc_updated_at 
    BEFORE UPDATE ON kyc_documents 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER audit_kyc_documents
    AFTER INSERT OR UPDATE OR DELETE ON kyc_documents
    FOR EACH ROW EXECUTE FUNCTION log_audit_trail();

-- ============================================
-- 10. VIEWS สำหรับ reporting (ใหม่) ✅
-- ============================================

-- View สำหรับ KYC dashboard
CREATE VIEW kyc_dashboard AS
SELECT 
    u.kyc_status,
    COUNT(*) as total_users,
    COUNT(CASE WHEN u.ai_verification_score >= 80 THEN 1 END) as high_ai_score_count,
    AVG(u.ai_verification_score) as avg_ai_score,
    COUNT(CASE WHEN u.background_check_status = 'passed' THEN 1 END) as bg_check_passed_count,
    MIN(u.created_at) as oldest_user,
    MAX(u.created_at) as newest_user
FROM users u
WHERE u.deleted_at IS NULL
GROUP BY u.kyc_status;

-- View สำหรับ daily transactions summary
CREATE VIEW daily_transactions_summary AS
SELECT 
    DATE(t.created_at) as transaction_date,
    t.type,
    t.status,
    COUNT(*) as transaction_count,
    SUM(t.amount) as total_amount,
    SUM(t.fee_amount) as total_fees,
    COUNT(DISTINCT t.user_id) as unique_users
FROM transactions t
WHERE DATE(t.created_at) >= CURRENT_DATE - 30
GROUP BY DATE(t.created_at), t.type, t.status;

-- View สำหรับ user wallet overview
CREATE VIEW user_wallet_overview AS
SELECT 
    u.id as user_id,
    u.email,
    u.full_name,
    u.kyc_level,
    u.kyc_status,
    u.wallet_balance,
    u.daily_limit,
    u.monthly_limit,
    
    -- Today's activity
    COALESCE(today.total_deposits_today, 0) as deposits_today,
    COALESCE(today.total_withdrawals_today, 0) as withdrawals_today,
    COALESCE(today.transaction_count_today, 0) as transactions_today,
    
    -- This month's activity
    COALESCE(this_month.total_deposits_month, 0) as deposits_month,
    COALESCE(this_month.total_withdrawals_month, 0) as withdrawals_month,
    COALESCE(this_month.transaction_count_month, 0) as transactions_month,
    
    -- Last snapshot
    ws.closing_balance as last_snapshot_balance,
    ws.snapshot_date as last_snapshot_date
    
FROM users u
LEFT JOIN LATERAL (
    SELECT 
        SUM(CASE WHEN type IN ('deposit', 'refund', 'bonus') THEN amount ELSE 0 END) as total_deposits_today,
        SUM(CASE WHEN type IN ('withdraw', 'fee', 'commission') THEN amount ELSE 0 END) as total_withdrawals_today,
        COUNT(*) as transaction_count_today
    FROM transactions t
    WHERE t.user_id = u.id 
        AND t.status = 'completed'
        AND DATE(t.completed_at) = CURRENT_DATE
) today ON true
LEFT JOIN LATERAL (
    SELECT 
        SUM(CASE WHEN type IN ('deposit', 'refund', 'bonus') THEN amount ELSE 0 END) as total_deposits_month,
        SUM(CASE WHEN type IN ('withdraw', 'fee', 'commission') THEN amount ELSE 0 END) as total_withdrawals_month,
        COUNT(*) as transaction_count_month
    FROM transactions t
    WHERE t.user_id = u.id 
        AND t.status = 'completed'
        AND DATE_TRUNC('month', t.completed_at) = DATE_TRUNC('month', CURRENT_DATE)
) this_month ON true
LEFT JOIN LATERAL (
    SELECT closing_balance, snapshot_date
    FROM wallet_snapshots ws
    WHERE ws.user_id = u.id
    ORDER BY snapshot_date DESC
    LIMIT 1
) ws ON true
WHERE u.deleted_at IS NULL;

-- ============================================
-- 11. COMMENTS สำหรับ documentation
-- ============================================

COMMENT ON TABLE users IS 'User profiles with KYC status and wallet information';
COMMENT ON TABLE kyc_documents IS 'KYC document submissions with AI verification results';
COMMENT ON TABLE transactions IS 'Financial transactions with partitioning for high volume (10M/day)';
COMMENT ON TABLE wallet_snapshots IS 'Daily wallet balance snapshots for auditing';
COMMENT ON TABLE audit_logs IS 'Audit trail for all data changes with partitioning';
COMMENT ON TABLE user_skills IS 'User skills and certifications';
COMMENT ON TABLE jobs IS 'Job postings and assignments';

COMMENT ON COLUMN users.daily_limit IS 'Daily withdrawal limit based on KYC level';
COMMENT ON COLUMN users.ai_verification_score IS 'AI face matching score (0-100)';
COMMENT ON COLUMN kyc_documents.ai_overall_score IS 'Overall AI verification score';
COMMENT ON COLUMN transactions.gateway_transaction_id IS 'External payment gateway transaction ID';
COMMENT ON COLUMN wallet_snapshots.snapshot_date IS 'Date of the snapshot (typically yesterday)';

-- ============================================
-- 12. GRANT PERMISSIONS (ถ้าใช้ role-based access)
-- ============================================
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY users_select_policy ON users FOR SELECT USING (true);
-- CREATE POLICY users_modify_policy ON users FOR ALL USING (current_user = 'admin');

-- ============================================
-- สรุปสิ่งที่เพิ่มเข้ามา:
-- 1. ✅ Soft delete (deleted_at) สำหรับทุกตาราง
-- 2. ✅ Optimistic locking (version) สำหรับป้องกัน concurrent updates
-- 3. ✅ Partitioning สำหรับ transactions และ audit_logs
-- 4. ✅ Wallet snapshots สำหรับ daily auditing
-- 5. ✅ Audit trail system
-- 6. ✅ KYC AI verification fields
-- 7. ✅ Financial limits และ validation
-- 8. ✅ Optimized indexes สำหรับ high volume
-- 9. ✅ Helper functions และ triggers
-- 10. ✅ Reporting views
-- ============================================