-- Create extension for UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255),
    
    -- Basic info
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON users(kyc_status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Create admin user (password: admin123)
INSERT INTO users (email, password_hash, full_name, kyc_status, kyc_level) 
VALUES (
  'admin@example.com',
  '$2b$10$YourHashedPasswordHere', -- ใช้ bcrypt hash ของ "admin123"
  'System Admin',
  'verified',
  'level_2'
) ON CONFLICT (email) DO NOTHING;

-- Log table creation
DO $$ 
BEGIN
    RAISE NOTICE 'Database initialized successfully';
END $$;