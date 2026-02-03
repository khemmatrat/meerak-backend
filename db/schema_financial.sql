-- =================================================================================
-- MEERAK FINANCIAL CORE SCHEMA v2.0 (FORENSIC-GRADE)
-- =================================================================================
-- ARCHITECTURE: Ledger-First, Double-Entry, Event-Sourced
-- AUDIT STANDARD: Immutable, Append-Only, Trigger-Enforced
-- =================================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 0. SYSTEM ACCOUNTS (Chart of Accounts)
-- ============================================
-- Define system-level accounts for double-entry bookkeeping
-- e.g., 'system_liability_users', 'system_revenue_fees', 'system_escrow_hold'
CREATE TABLE system_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL, -- e.g., '1001-ASSET-CASH'
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 1. WALLETS (The State Container)
-- ============================================
-- Balances are derived from Ledger, but cached here for performance.
-- Strict locking required during updates.
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    currency VARCHAR(3) DEFAULT 'THB' CHECK (char_length(currency) = 3),
    
    -- Balances (Cached, verify against ledger sum)
    balance NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
    locked_balance NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (locked_balance >= 0),
    
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
    
    -- Concurrency & Integrity
    last_ledger_sequence BIGINT DEFAULT 0, -- Points to the last processed ledger entry
    version INTEGER DEFAULT 1, -- Optimistic locking
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, currency)
);

-- ============================================
-- 2. FINANCIAL EVENTS (The "Intent")
-- ============================================
-- Represents a business intent (e.g., "User A pays User B").
-- This is NOT the accounting record yet.
CREATE TABLE financial_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL, -- 'deposit', 'job_payment', 'withdrawal', 'refund'
    
    amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'THB',
    
    provider VARCHAR(50) NOT NULL, -- 'stripe', 'truemoney', 'promptpay', 'internal'
    provider_ref_id VARCHAR(255), -- External Transaction ID (e.g., Stripe Charge ID)
    
    -- Idempotency (CRITICAL)
    idempotency_key VARCHAR(255) UNIQUE NOT NULL, 
    
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    
    metadata JSONB DEFAULT '{}', -- Store raw webhook payload here for audit
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_provider_ref ON financial_events(provider, provider_ref_id);

-- ============================================
-- 3. LEDGER ENTRIES (The "Truth" - Double Entry)
-- ============================================
-- IMMUTABLE TABLE: No UPDATE, No DELETE allowed.
-- Every row represents a debit or credit to a specific account/wallet.
CREATE TABLE ledger_entries (
    id BIGSERIAL PRIMARY KEY, -- Use Serial for strict ordering
    transaction_group_id UUID NOT NULL, -- Links Dr/Cr pairs together (The "Transaction")
    
    event_id UUID REFERENCES financial_events(id), -- Trace back to business intent
    
    -- Account Identification (One must be null, one set)
    wallet_id UUID REFERENCES wallets(id), -- User Account
    system_account_id UUID REFERENCES system_accounts(id), -- System Account
    
    -- The Money
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('debit', 'credit')),
    amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'THB',
    
    -- Running Balance (Snapshot for quick audit)
    balance_after NUMERIC(18,2) NOT NULL,
    
    description TEXT NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraint: Either wallet or system account, never both or neither
    CONSTRAINT chk_account_target CHECK (
        (wallet_id IS NOT NULL AND system_account_id IS NULL) OR 
        (wallet_id IS NULL AND system_account_id IS NOT NULL)
    )
);

CREATE INDEX idx_ledger_wallet ON ledger_entries(wallet_id);
CREATE INDEX idx_ledger_group ON ledger_entries(transaction_group_id);

-- ============================================
-- 4. ESCROW AGREEMENTS (State Machine)
-- ============================================
CREATE TABLE escrow_agreements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL UNIQUE, -- 1 Job = 1 Escrow
    
    payer_wallet_id UUID NOT NULL REFERENCES wallets(id),
    payee_wallet_id UUID REFERENCES wallets(id), -- Can be null initially
    
    amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    fee_amount NUMERIC(18,2) DEFAULT 0.00,
    
    status VARCHAR(30) DEFAULT 'created' CHECK (status IN (
        'created', -- Agreement made
        'funded',  -- Money moved from User -> Escrow System Account
        'active',  -- Job in progress
        'disputed', -- Dispute raised
        'released', -- Money moved Escrow -> Provider
        'refunded', -- Money moved Escrow -> Payer
        'cancelled'
    )),
    
    -- Time locks & Auto-release
    auto_release_at TIMESTAMP WITH TIME ZONE,
    dispute_deadline_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1
);

-- ============================================
-- 5. RECONCILIATION RUNS (Daily Check)
-- ============================================
CREATE TABLE reconciliation_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    provider VARCHAR(50) NOT NULL,
    
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'mismatch_found', 'resolved')),
    
    total_system_amount NUMERIC(18,2) DEFAULT 0,
    total_provider_amount NUMERIC(18,2) DEFAULT 0,
    mismatch_amount NUMERIC(18,2) DEFAULT 0,
    
    report_url TEXT, -- Path to detailed CSV/JSON report
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- 6. AUDIT LOGS (Forensic Trace)
-- ============================================
CREATE TABLE financial_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL, -- 'wallet', 'escrow', 'event'
    entity_id UUID NOT NULL,
    
    action VARCHAR(20) NOT NULL,
    actor_id UUID, -- Who did it?
    actor_ip INET,
    reason TEXT,
    
    state_before JSONB,
    state_after JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 7. TRIGGERS & SECURITY ENFORCEMENT
-- ============================================

-- 7.1 IMMUTABILITY: Prevent modifications to Ledger
CREATE OR REPLACE FUNCTION prevent_ledger_tampering()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        RAISE EXCEPTION 'SECURITY ALERT: Attempt to DELETE from immutable ledger!';
    ELSIF (TG_OP = 'UPDATE') THEN
        RAISE EXCEPTION 'SECURITY ALERT: Attempt to UPDATE immutable ledger! Use corrective transactions instead.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_immutable
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_tampering();

-- 7.2 AUDIT: Auto-log changes to sensitive tables
CREATE OR REPLACE FUNCTION log_financial_change()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO financial_audit_logs (
        entity_type, entity_id, action, 
        state_before, state_after, 
        actor_id, created_at
    ) VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END,
        NULL, -- Application must set current_user via SET LOCAL app.current_user_id
        CURRENT_TIMESTAMP
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_wallets
AFTER INSERT OR UPDATE OR DELETE ON wallets
FOR EACH ROW EXECUTE FUNCTION log_financial_change();

CREATE TRIGGER trg_audit_escrow
AFTER INSERT OR UPDATE OR DELETE ON escrow_agreements
FOR EACH ROW EXECUTE FUNCTION log_financial_change();

-- 7.3 IMMUTABILITY: Prevent modifications to Audit Logs
CREATE OR REPLACE FUNCTION prevent_audit_log_tampering()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        RAISE EXCEPTION 'SECURITY ALERT: Attempt to TAMPER with Audit Logs! This incident will be reported.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON financial_audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_tampering();

-- 7.4 INTEGRITY: Prevent direct balance manipulation without Ledger reference
CREATE OR REPLACE FUNCTION prevent_direct_balance_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow updates ONLY if last_ledger_sequence is also updated (implies driven by ledger process)
    -- OR if it's a status change/lock without balance change
    IF (NEW.balance <> OLD.balance) AND (NEW.last_ledger_sequence = OLD.last_ledger_sequence) THEN
        RAISE EXCEPTION 'DATA INTEGRITY ERROR: Cannot update wallet balance directly! Must go through Ledger.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_wallet_balance
BEFORE UPDATE ON wallets
FOR EACH ROW EXECUTE FUNCTION prevent_direct_balance_update();

-- ============================================
-- 8. SEED SYSTEM ACCOUNTS
-- ============================================
INSERT INTO system_accounts (code, name, type, description) VALUES
('1001', 'System Cash Asset', 'asset', 'Holding account for money in bank/stripe'),
('2001', 'User Liabilities', 'liability', 'Total money owed to users (Sum of all wallets)'),
('2002', 'Escrow Liabilities', 'liability', 'Money held in escrow'),
('4001', 'Fee Revenue', 'revenue', 'Platform fees collected');

