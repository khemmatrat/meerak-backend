-- ============================================
-- INITIAL SCHEMA V1.0
-- Firebase Functions Hybrid with PostgreSQL
-- Created: 2024
-- Description: Base schema for KYC + Job platform
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. USERS TABLE
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
    kyc_status VARCHAR(20) DEFAULT 'pending',
    kyc_level VARCHAR(10),
    account_status VARCHAR(20) DEFAULT 'active',
    
    -- Wallet
    wallet_balance DECIMAL(12,2) DEFAULT 0.00,
    wallet_pending DECIMAL(12,2) DEFAULT 0.00,
    
    -- Stats
    total_earnings DECIMAL(12,2) DEFAULT 0.00,
    total_jobs INTEGER DEFAULT 0,
    rating DECIMAL(3,2) DEFAULT 0.00,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP
);

-- Indexes for users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_kyc_status ON users(kyc_status);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);

-- ============================================
-- 2. KYC DOCUMENTS TABLE
-- ============================================
CREATE TABLE kyc_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    firebase_uid VARCHAR(255),
    
    full_name VARCHAR(255) NOT NULL,
    id_card_number VARCHAR(13) NOT NULL,
    birth_date DATE NOT NULL,
    document_type VARCHAR(50),
    document_url TEXT,
    document_hash VARCHAR(64),
    file_size_kb INTEGER,
    
    -- Verification
    verification_status VARCHAR(20) DEFAULT 'pending',
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP,
    rejection_reason TEXT,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for kyc_documents
CREATE INDEX idx_kyc_user_id ON kyc_documents(user_id);
CREATE INDEX idx_kyc_status ON kyc_documents(verification_status);
CREATE INDEX idx_kyc_firebase_uid ON kyc_documents(firebase_uid);
CREATE INDEX idx_kyc_submitted_at ON kyc_documents(submitted_at);

-- ============================================
-- 3. USER SKILLS TABLE
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
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, skill_name)
);

-- Indexes for user_skills
CREATE INDEX idx_skills_user_id ON user_skills(user_id);
CREATE INDEX idx_skills_category ON user_skills(skill_category);
CREATE INDEX idx_skills_certified ON user_skills(is_certified) WHERE is_certified = TRUE;

-- ============================================
-- 4. JOBS TABLE
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
    budget_type VARCHAR(20),
    budget_amount DECIMAL(12,2),
    currency VARCHAR(3) DEFAULT 'THB',
    
    -- Status
    status VARCHAR(20) DEFAULT 'open',
    priority VARCHAR(20) DEFAULT 'normal',
    
    -- Timeline
    posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    deadline TIMESTAMP,
    
    -- Relationships
    client_id UUID REFERENCES users(id),
    provider_id UUID REFERENCES users(id),
    
    -- Stats
    view_count INTEGER DEFAULT 0,
    proposal_count INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for jobs
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_category ON jobs(category);
CREATE INDEX idx_jobs_client_id ON jobs(client_id);
CREATE INDEX idx_jobs_provider_id ON jobs(provider_id);
CREATE INDEX idx_jobs_posted_at ON jobs(posted_at);
CREATE INDEX idx_jobs_location ON jobs(latitude, longitude);
CREATE INDEX idx_jobs_budget ON jobs(budget_amount) WHERE status = 'open';

-- ============================================
-- 5. TRANSACTIONS TABLE (Initial Version)
-- ============================================
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Transaction Info
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'THB',
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending',
    payment_method VARCHAR(50),
    payment_reference VARCHAR(255),
    
    -- Related Entities
    job_id UUID REFERENCES jobs(id),
    from_user_id UUID REFERENCES users(id),
    to_user_id UUID REFERENCES users(id),
    
    -- Metadata
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Indexes for transactions
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_payment_ref ON transactions(payment_reference) 
    WHERE payment_reference IS NOT NULL;

-- ============================================
-- 6. NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    
    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    data JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP,
    
    INDEX idx_notifications_user_id ON notifications(user_id),
    INDEX idx_notifications_is_read ON notifications(is_read) WHERE is_read = FALSE,
    INDEX idx_notifications_created_at ON notifications(created_at DESC)
);

-- ============================================
-- 7. ADMIN LOGS TABLE (Basic)
-- ============================================
CREATE TABLE admin_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    action_type VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    
    old_values JSONB,
    new_values JSONB,
    
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_admin_logs_admin_id ON admin_logs(admin_id),
    INDEX idx_admin_logs_created_at ON admin_logs(created_at DESC),
    INDEX idx_admin_logs_action ON admin_logs(action_type)
);

-- ============================================
-- 8. FUNCTION: Update updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language plpgsql;

-- ============================================
-- 9. TRIGGERS for updated_at
-- ============================================
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kyc_documents_updated_at 
    BEFORE UPDATE ON kyc_documents 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_skills_updated_at 
    BEFORE UPDATE ON user_skills 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at 
    BEFORE UPDATE ON jobs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 10. COMMENTS
-- ============================================
COMMENT ON TABLE users IS 'User accounts synchronized with Firebase Auth';
COMMENT ON TABLE kyc_documents IS 'KYC document submissions for identity verification';
COMMENT ON TABLE user_skills IS 'User skills and certifications for job matching';
COMMENT ON TABLE jobs IS 'Job postings and assignments';
COMMENT ON TABLE transactions IS 'Financial transactions and payments';
COMMENT ON TABLE notifications IS 'User notifications system';
COMMENT ON TABLE admin_logs IS 'Administrative action logs';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================