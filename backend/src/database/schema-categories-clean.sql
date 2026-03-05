-- Database Schema for Job Categories
-- Clean version without encoding issues

-- Add category fields to jobs table
ALTER TABLE jobs 
  ADD COLUMN IF NOT EXISTS category_type VARCHAR(50) 
    CHECK (category_type IN ('maid', 'detective', 'logistics', 'ac_cleaning'));

ALTER TABLE jobs 
  ADD COLUMN IF NOT EXISTS category_details JSONB;

-- Create job_billings table
CREATE TABLE IF NOT EXISTS job_billings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id VARCHAR(100) REFERENCES jobs(id) ON DELETE CASCADE UNIQUE NOT NULL,
  
  base_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  
  service_fee_percent DECIMAL(5,2) DEFAULT 5.00 CHECK (service_fee_percent >= 0 AND service_fee_percent <= 10),
  service_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  
  insurance_amount DECIMAL(10,2) DEFAULT 0,
  insurance_coverage DECIMAL(10,2) DEFAULT 0,
  
  additional_charges JSONB DEFAULT '{}'::jsonb,
  
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  
  billing_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_job_billings_job_id ON job_billings(job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_category_type ON jobs(category_type);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_job_billings_updated_at ON job_billings;
CREATE TRIGGER update_job_billings_updated_at
BEFORE UPDATE ON job_billings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
