-- Database Schema for Backend Express and Firebase Functions
-- Run this script to create/update database schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- ============= USERS TABLE =============
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  firebase_uid VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  full_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'provider', 'admin')),
  kyc_level VARCHAR(50) DEFAULT 'level_1' CHECK (kyc_level IN ('level_1', 'level_2')),
  kyc_status VARCHAR(50) DEFAULT 'not_submitted' CHECK (kyc_status IN ('not_submitted', 'pending_review', 'verified', 'rejected', 'ai_verified', 'ai_failed', 'admin_approved')),
  wallet_balance DECIMAL(10,2) DEFAULT 0,
  wallet_pending DECIMAL(10,2) DEFAULT 0,
  balance DECIMAL(10,2) DEFAULT 0, --  Functions compatibility
  total_deposits DECIMAL(10,2) DEFAULT 0, --  Functions compatibility
  avatar_url TEXT,
  location JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON users(kyc_status);

-- ============= KYC SUBMISSIONS TABLE =============
CREATE TABLE IF NOT EXISTS kyc_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  firebase_uid VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  id_card_number VARCHAR(13),
  birth_date DATE,
  document_urls JSONB,
  ai_score INTEGER DEFAULT 0,
  ai_success BOOLEAN DEFAULT FALSE,
  ai_verified_at TIMESTAMP,
  background_check_passed BOOLEAN DEFAULT FALSE,
  background_check_risk_level VARCHAR(20) DEFAULT 'low' CHECK (background_check_risk_level IN ('low', 'medium', 'high')),
  kyc_status VARCHAR(50) DEFAULT 'pending_review',
  kyc_level VARCHAR(50) DEFAULT 'level_1',
  submitted_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (firebase_uid) REFERENCES users(firebase_uid) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_kyc_submissions_firebase_uid ON kyc_submissions(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_kyc_submissions_status ON kyc_submissions(kyc_status);
CREATE INDEX IF NOT EXISTS idx_kyc_submissions_submitted_at ON kyc_submissions(submitted_at DESC);

-- ============= TRANSACTIONS TABLE =============
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('deposit', 'withdraw', 'transfer', 'payment', 'income', 'payment_out', 'refund', 'commission', 'fee')),
  reference_id VARCHAR(255), -- for Functions compatibility
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'pending_release')),
  metadata JSONB,
  related_job_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  released_at TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_related_job_id ON transactions(related_job_id);

-- ============= USER SKILLS TABLE =============
CREATE TABLE IF NOT EXISTS user_skills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  skill_name VARCHAR(255) NOT NULL,
  skill_category VARCHAR(255) NOT NULL,
  certification_id UUID,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_skills_user_id ON user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_category ON user_skills(skill_category);

-- ============= USER CERTIFICATIONS TABLE =============
CREATE TABLE IF NOT EXISTS user_certifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  certification_name VARCHAR(255) NOT NULL,
  certification_type VARCHAR(255) NOT NULL,
  issuer VARCHAR(255) NOT NULL,
  certificate_url TEXT,
  issued_date DATE,
  expiry_date DATE,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_certifications_user_id ON user_certifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_certifications_type ON user_certifications(certification_type);

-- ============= JOBS TABLE =============
CREATE TABLE IF NOT EXISTS jobs (
  id VARCHAR(100) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  price DECIMAL(10,2),
  budget_amount DECIMAL(10,2), -- for Functions compatibility
  status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'in_progress', 'completed', 'cancelled', 'waiting_for_payment')),
  payment_status VARCHAR(50) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
  created_by VARCHAR(255), -- firebase_uid or user id
  created_by_name VARCHAR(255),
  created_by_avatar TEXT,
  client_id UUID REFERENCES users(id),
  accepted_by VARCHAR(255), -- firebase_uid or user id
  provider_id UUID REFERENCES users(id),
  location JSONB,
  location_lat DECIMAL(10,8), --  Functions compatibility
  location_lng DECIMAL(11,8), --  Functions compatibility
  datetime TIMESTAMP,
  payment_details JSONB,
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
CREATE INDEX IF NOT EXISTS idx_jobs_created_by ON jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_provider_id ON jobs(provider_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);

-- ============= TRIGGERS =============

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_kyc_submissions_updated_at ON kyc_submissions;
CREATE TRIGGER update_kyc_submissions_updated_at
BEFORE UPDATE ON kyc_submissions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
CREATE TRIGGER update_jobs_updated_at
BEFORE UPDATE ON jobs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============= FUNCTIONS COMPATIBILITY =============

-- Function to sync wallet_balance with balance (for Functions compatibility)
CREATE OR REPLACE FUNCTION sync_wallet_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync wallet_balance to balance when wallet_balance changes
  IF TG_OP = 'UPDATE' AND OLD.wallet_balance IS DISTINCT FROM NEW.wallet_balance THEN
    NEW.balance = NEW.wallet_balance;
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS sync_balance_on_wallet_update ON users;
CREATE TRIGGER sync_balance_on_wallet_update
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION sync_wallet_balance();


-- ============= VIEWS =============

-- View for user summary with KYC status
CREATE OR REPLACE VIEW user_summary AS
SELECT 
  u.id,
  u.firebase_uid,
  u.email,
  u.phone,
  u.full_name,
  u.role,
  u.kyc_level,
  u.kyc_status,
  u.wallet_balance,
  u.wallet_pending,
  u.balance,
  u.avatar_url,
  u.location,
  u.created_at,
  u.updated_at,
  k.kyc_status as latest_kyc_status,
  k.kyc_level as latest_kyc_level,
  k.ai_score as latest_ai_score,
  k.submitted_at as kyc_submitted_at
FROM users u
LEFT JOIN LATERAL (
  SELECT kyc_status, kyc_level, ai_score, submitted_at
  FROM kyc_submissions
  WHERE firebase_uid = u.firebase_uid
  ORDER BY submitted_at DESC
  LIMIT 1
) k ON true;
