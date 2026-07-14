-- ขยาย users.kyc_status CHECK ให้รองรับ supplement_required, resubmission_required, pending_review ฯลฯ

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_kyc_status_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_kyc_status;

ALTER TABLE users ADD CONSTRAINT users_kyc_status_check CHECK (
  kyc_status IS NULL OR kyc_status IN (
    'not_submitted',
    'pending',
    'pending_review',
    'pending_ai_verification',
    'under_review',
    'ai_verified',
    'ai_failed',
    'verified',
    'approved',
    'rejected',
    'verification_failed',
    'resubmission_required',
    'supplement_required'
  )
);
