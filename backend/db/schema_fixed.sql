-- ============ EXTENSIONS ============
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============ USERS TABLE ============
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Firebase sync
    firebase_uid VARCHAR(255) UNIQUE,
    
    -- Authentication
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255),
    
    -- Profile
    full_name VARCHAR(255),
    display_name VARCHAR(255),
    date_of_birth DATE,
    avatar_url TEXT,
    bio TEXT,
    
    -- KYC
    id_card_number VARCHAR(13),
    kyc_status VARCHAR(20) DEFAULT 'not_submitted',
    kyc_level VARCHAR(10) DEFAULT 'level_1',
    kyc_submitted_at TIMESTAMP,
    kyc_verified_at TIMESTAMP,
    
    -- Account
    role VARCHAR(50) DEFAULT 'user',
    account_status VARCHAR(20) DEFAULT 'active',
    is_banned BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    
    -- Wallet
    wallet_balance DECIMAL(12,2) DEFAULT 0.00,
    wallet_pending DECIMAL(12,2) DEFAULT 0.00,
    daily_limit DECIMAL(12,2) DEFAULT 50000.00,
    monthly_limit DECIMAL(12,2) DEFAULT 500000.00,
    
    -- Skills & Training
    skills JSONB DEFAULT '[]',
    trainings JSONB DEFAULT '[]',
    availability JSONB DEFAULT '[]',
    
    -- Location
    location JSONB,
    
    -- Statistics
    completed_jobs_count INTEGER DEFAULT 0,
    rating DECIMAL(3,2) DEFAULT 0.00,
    
    -- AI Verification
    ai_verification_score INTEGER,
    ai_verification_status VARCHAR(20),
    
    -- Bank accounts
    bank_accounts JSONB DEFAULT '[]',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP
);

-- ============ JOBS TABLE ============
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    price DECIMAL(12,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'open',
    
    -- Location
    location JSONB,
    address TEXT,
    
    -- Timing
    datetime TIMESTAMP,
    duration_hours INTEGER DEFAULT 2,
    
    -- Client
    created_by VARCHAR(100),
    created_by_name VARCHAR(255),
    created_by_avatar TEXT,
    client_id VARCHAR(100),
    
    -- Provider
    accepted_by VARCHAR(100),
    accepted_by_name VARCHAR(255),
    provider_id VARCHAR(100),
    
    -- Payment
    payment_details JSONB,
    payment_status VARCHAR(50) DEFAULT 'pending',
    tips_amount DECIMAL(12,2) DEFAULT 0.00,
    
    -- Commission
    commission_rate DECIMAL(5,2),
    provider_receive DECIMAL(12,2),
    
    -- Job execution
    started_at TIMESTAMP,
    submitted_at TIMESTAMP,
    approved_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============ TRANSACTIONS TABLE ============
CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    
    -- Related entities
    related_job_id VARCHAR(100),
    
    -- Bank info
    bank_info TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============ KYC SUBMISSIONS TABLE ============
CREATE TABLE IF NOT EXISTS kyc_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    
    -- Personal info
    full_name VARCHAR(255),
    birth_date DATE,
    id_card_number VARCHAR(13),
    
    -- Document URLs
    id_card_front_url TEXT,
    id_card_back_url TEXT,
    selfie_photo_url TEXT,
    driving_license_front_url TEXT,
    driving_license_back_url TEXT,
    selfie_video_url TEXT,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending_review',
    admin_notes TEXT,
    
    -- Timestamps
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP
);

-- ============ NOTIFICATIONS TABLE ============
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,
    
    -- Content
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    
    -- Related entity
    related_id VARCHAR(255),
    
    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============ INDEXES ============
-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON users(kyc_status);

-- Jobs indexes
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_by ON jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_jobs_accepted_by ON jobs(accepted_by);
CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);

-- Transactions indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_related_job ON transactions(related_job_id);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read) WHERE is_read = FALSE;

-- KYC indexes
CREATE INDEX IF NOT EXISTS idx_kyc_user_id ON kyc_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_submissions(status);

-- ============ INSERT SAMPLE DATA ============
INSERT INTO users (
    id, firebase_uid, email, phone, full_name, 
    role, kyc_level, wallet_balance, avatar_url,
    skills, completed_jobs_count, location
) VALUES 
(
    '550e8400-e29b-41d4-a716-446655440000',
    'demo-anna-id',
    'anna@meerak.app',
    '0800000001',
    'Anna Employer',
    'user',
    'level_2',
    50000.00,
    'https://i.pravatar.cc/150?u=anna',
    '[]',
    0,
    '{"lat": 13.7462, "lng": 100.5347}'
),
(
    '550e8400-e29b-41d4-a716-446655440001',
    'demo-bob-id',
    'bob@meerak.app',
    '0800000002',
    'Bob Provider',
    'provider',
    'level_2',
    100.00,
    'https://i.pravatar.cc/150?u=bob',
    '["Electrician", "Cleaning", "Driver"]',
    10,
    '{"lat": 13.7465, "lng": 100.535}'
)
ON CONFLICT (email) DO NOTHING;

-- Insert sample jobs
INSERT INTO jobs (
    id, title, description, category, price, status,
    created_by, created_by_name, created_by_avatar,
    datetime, created_at
) VALUES 
(
    'job-001',
    'Delivery Service',
    'Need to deliver documents from Sukhumvit to Silom',
    'Delivery',
    500.00,
    'open',
    '550e8400-e29b-41d4-a716-446655440000',
    'Anna Employer',
    'https://i.pravatar.cc/150?u=anna',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'job-002',
    'Home Cleaning',
    'Deep cleaning for 2-bedroom apartment',
    'Cleaning',
    1200.00,
    'open',
    '550e8400-e29b-41d4-a716-446655440000',
    'Anna Employer',
    'https://i.pravatar.cc/150?u=anna',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO NOTHING;

-- Insert sample transaction
INSERT INTO transactions (
    id, user_id, type, amount, description, status, date
) VALUES 
(
    'tx-001',
    '550e8400-e29b-41d4-a716-446655440000',
    'deposit',
    50000.00,
    'Initial deposit',
    'completed',
    CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO NOTHING;