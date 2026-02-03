-- =================================================================================
-- MEERAK PRODUCTION SCHEMA (SECURITY & FINANCIAL HARDENING)
-- =================================================================================
-- DESIGN PRINCIPLES:
-- 1. DATA INTEGRITY: UUIDs, Foreign Keys, CHECK constraints for all states/amounts.
-- 2. FINANCIAL SAFETY: NUMERIC(18,2) for all money. No FLOATs.
-- 3. IMMUTABILITY: Transactions are append-only. Balances are derived/verified.
-- 4. SEPARATION OF DUTIES: Profile data (users) separated from Money data (wallets).
-- 5. AUDITABILITY: Every change is logged. Soft deletes only.
-- =================================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. USERS (Profile & Auth Only - No Money Here)
-- ============================================
-- WHY: Separating profile from wallet reduces impact of SQL injection on profile updates.
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firebase_uid VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255), -- Optional if using Firebase Auth only

    -- Identity
    full_name VARCHAR(255),
    id_card_number VARCHAR(13), -- Sensitive
    date_of_birth DATE,

    -- Compliance Status
    kyc_status VARCHAR(20) DEFAULT 'pending' CHECK (kyc_status IN ('not_submitted', 'pending', 'under_review', 'verified', 'rejected', 'ai_verified', 'ai_failed')),
    kyc_level VARCHAR(10) DEFAULT 'level_1' CHECK (kyc_level IN ('level_1', 'level_2', 'level_3')),
    
    -- Account Security
    account_status VARCHAR(20) DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'banned', 'frozen')),
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    
    -- Stats
    rating NUMERIC(3,2) DEFAULT 0.00 CHECK (rating >= 0 AND rating <= 5),
    total_jobs_completed INTEGER DEFAULT 0 CHECK (total_jobs_completed >= 0),

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE, -- Soft Delete
    version INTEGER DEFAULT 1 -- Optimistic Locking
);

CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_kyc_status ON users(kyc_status);

-- ============================================
-- 2. WALLETS (The "Vault")
-- ============================================
-- WHY: High-security table. One user can have multiple wallets (e.g., THB, Points).
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, -- Prevent deleting user with money
    
    currency VARCHAR(3) DEFAULT 'THB' CHECK (char_length(currency) = 3),
    balance NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0), -- No overdrafts allowed in DB
    frozen_balance NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (frozen_balance >= 0), -- Money held for disputes/investigation
    
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
    
    -- Limits (Defensive Coding)
    daily_withdrawal_limit NUMERIC(18,2) DEFAULT 50000.00 CHECK (daily_withdrawal_limit >= 0),
    max_balance_limit NUMERIC(18,2) DEFAULT 2000000.00,

    -- Security
    last_audit_at TIMESTAMP WITH TIME ZONE,
    checksum VARCHAR(255), -- Optional: Hash of balance + id for tamper detection

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    
    UNIQUE(user_id, currency) -- One wallet per currency per user
);

CREATE INDEX idx_wallets_user_id ON wallets(user_id);

-- ============================================
-- 3. KYC DOCUMENTS (Identity Verification)
-- ============================================
CREATE TABLE kyc_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('id_card_front', 'id_card_back', 'passport', 'selfie_holding_id')),
    document_url TEXT NOT NULL, -- Encrypted path or secure URL
    document_hash VARCHAR(64) NOT NULL, -- SHA256 to prevent duplicate uploads
    
    verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    rejection_reason TEXT,
    
    -- AI Analysis Results
    ai_confidence_score NUMERIC(5,2),
    ai_data JSONB, -- Stores OCR results, face match score

    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by UUID REFERENCES users(id)
);

CREATE INDEX idx_kyc_user_id ON kyc_documents(user_id);
CREATE INDEX idx_kyc_hash ON kyc_documents(document_hash);

-- ============================================
-- 4. JOBS (Business Logic)
-- ============================================
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES users(id),
    provider_id UUID REFERENCES users(id), -- Nullable until hired
    
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    
    -- Financials
    budget_amount NUMERIC(18,2) NOT NULL CHECK (budget_amount > 0),
    currency VARCHAR(3) DEFAULT 'THB',
    payment_type VARCHAR(20) CHECK (payment_type IN ('fixed', 'hourly')),
    
    -- State Machine
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'matched', 'in_progress', 'completed', 'cancelled', 'disputed')),
    
    location_data JSONB, -- { lat, lng, address }
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    version INTEGER DEFAULT 1
);

CREATE INDEX idx_jobs_client ON jobs(client_id);
CREATE INDEX idx_jobs_provider ON jobs(provider_id);
CREATE INDEX idx_jobs_status ON jobs(status);

-- ============================================
-- 5. TRANSACTIONS (The Immutable Ledger)
-- ============================================
-- WHY: This is the heart of the system. Must be append-only logic (enforced by code/triggers).
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES wallets(id),
    
    -- Double-Entry Accounting Principles
    type VARCHAR(30) NOT NULL CHECK (type IN (
        'deposit', 'withdrawal', 
        'job_payment_hold', 'job_payment_release', -- Escrow logic
        'refund', 'fee', 'adjustment'
    )),
    
    amount NUMERIC(18,2) NOT NULL CHECK (amount > 0), -- Always positive. Direction determined by 'dr_cr' or logic.
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('in', 'out')), -- Explicit flow
    
    balance_before NUMERIC(18,2) NOT NULL,
    balance_after NUMERIC(18,2) NOT NULL, -- Snapshot for quick auditing
    
    -- Idempotency & Tracing
    reference_type VARCHAR(50) NOT NULL, -- e.g., 'job', 'stripe_charge', 'admin_adjustment'
    reference_id VARCHAR(255) NOT NULL, -- ID of the job, or stripe charge ID
    idempotency_key VARCHAR(255) UNIQUE, -- CRITICAL: Prevents double-spending/double-charging
    
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
    
    description TEXT,
    metadata JSONB DEFAULT '{}', -- Store IP, User Agent, Location
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    -- No updated_at: Transactions should be immutable. If wrong, insert a reversal transaction.
);

CREATE INDEX idx_transactions_wallet ON transactions(wallet_id);
CREATE INDEX idx_transactions_ref ON transactions(reference_type, reference_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);

-- ============================================
-- 6. ESCROW HOLDS (Temporary Money Locking)
-- ============================================
-- WHY: Money for jobs is "held" separately from the user's main balance.
CREATE TABLE escrow_holds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id),
    payer_wallet_id UUID NOT NULL REFERENCES wallets(id),
    
    amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    status VARCHAR(20) DEFAULT 'held' CHECK (status IN ('held', 'released', 'refunded', 'disputed')),
    
    held_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- 7. AUDIT LOGS (Traceability)
-- ============================================
-- WHY: "Who changed what and when?"
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(10) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    
    actor_id UUID REFERENCES users(id), -- Who did it?
    ip_address INET,
    
    old_values JSONB,
    new_values JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 8. TRIGGERS & FUNCTIONS
-- ============================================

-- Function: Auto-update updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    NEW.version = COALESCE(OLD.version, 0) + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Users
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Trigger: Wallets
CREATE TRIGGER trg_wallets_updated BEFORE UPDATE ON wallets
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Trigger: Jobs
CREATE TRIGGER trg_jobs_updated BEFORE UPDATE ON jobs
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Function: Prevent Transaction Modification (Immutability)
CREATE OR REPLACE FUNCTION prevent_transaction_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
        RAISE EXCEPTION 'Transactions are immutable! Create a reversal transaction instead.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_transactions
BEFORE UPDATE OR DELETE ON transactions
FOR EACH ROW EXECUTE FUNCTION prevent_transaction_change();

-- Function: Audit Logging
CREATE OR REPLACE FUNCTION log_audit()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs (table_name, record_id, action, old_values, new_values, actor_id)
    VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END,
        NULL -- Note: Passing actor_id usually requires application context (SET app.current_user_id)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply Audit to critical tables
CREATE TRIGGER trg_audit_users AFTER INSERT OR UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION log_audit();
CREATE TRIGGER trg_audit_wallets AFTER INSERT OR UPDATE OR DELETE ON wallets FOR EACH ROW EXECUTE FUNCTION log_audit();
CREATE TRIGGER trg_audit_jobs AFTER INSERT OR UPDATE OR DELETE ON jobs FOR EACH ROW EXECUTE FUNCTION log_audit();
