-- Provider onboarding columns used by approve-provider + training flow
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_test_passed_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_test_last_failed_at TIMESTAMP;
