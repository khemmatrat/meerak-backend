-- ============ DROP EXISTING TABLES ============
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;
DROP TABLE IF EXISTS kyc_submissions CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS kyc_documents CASCADE;
DROP TABLE IF EXISTS wallet_snapshots CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============ USERS TABLE ============
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    password_hash VARCHAR(255),
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
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP
);

-- ============ JOBS TABLE ============
CREATE TABLE jobs (
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
    created_by UUID REFERENCES users(id),
    created_by_name VARCHAR(255),
    created_by_avatar TEXT,
    client_id UUID REFERENCES users(id),
    
    -- Provider
    accepted_by UUID REFERENCES users(id),
    accepted_by_name VARCHAR(255),
    provider_id UUID REFERENCES users(id),
    
    -- Payment
    payment_details JSONB,
    payment_status VARCHAR(50) DEFAULT 'pending',
    tips_amount DECIMAL(12,2) DEFAULT 0.00,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============ TRANSACTIONS TABLE ============
CREATE TABLE transactions (
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
    
    -- Timestamps
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============ SAMPLE DATA ============
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
);

-- Insert sample jobs
INSERT INTO jobs (
    id, title, description, category, price, status,
    created_by, created_by_name, created_by_avatar,
    datetime, created_at
) VALUES 
(
    '550e8400-e29b-41d4-a716-446655440010',
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
    '550e8400-e29b-41d4-a716-446655440011',
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
);

-- Insert sample transaction
INSERT INTO transactions (
    id, user_id, type, amount, description, status, transaction_date
) VALUES 
(
    'tx-001',
    '550e8400-e29b-41d4-a716-446655440000',
    'deposit',
    50000.00,
    'Initial deposit',
    'completed',
    CURRENT_TIMESTAMP
);

-- ============ INDEXES ============
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_users_kyc_status ON users(kyc_status);
CREATE INDEX idx_users_role ON users(role);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created_by ON jobs(created_by);
CREATE INDEX idx_jobs_accepted_by ON jobs(accepted_by);
CREATE INDEX idx_jobs_category ON jobs(category);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_related_job ON transactions(related_job_id);