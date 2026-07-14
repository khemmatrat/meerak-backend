-- 239: Course Marketplace Phase 0 guardrails (sell eligibility, constraints, seed polish)
-- Run after 235–238. Safe to re-run (idempotent where possible).

COMMENT ON COLUMN courses.is_marketplace IS
  'TRUE = Udemy-style sellable course. FALSE = Nexus LMS / training onboarding course (see nexus_module).';

COMMENT ON COLUMN users.can_sell_courses IS
  'Auto-maintained: TRUE when VERIFIED_PROVIDER, eligible KYC, or TRAINING_COMPLETE/QUALIFIED onboarding.';

-- Prod DBs ที่ยังไม่เคย boot server.js อาจไม่มีคอลัมน์นี้ (เดิม ADD ตอน runtime เท่านั้น)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(50) DEFAULT 'NOT_STARTED';

-- Backfill sell eligibility
UPDATE users
SET can_sell_courses = TRUE
WHERE can_sell_courses IS DISTINCT FROM TRUE
  AND (
    UPPER(COALESCE(provider_status, '')) = 'VERIFIED_PROVIDER'
    OR LOWER(COALESCE(kyc_status, '')) IN ('verified', 'approved', 'ai_verified')
    OR UPPER(COALESCE(onboarding_status, '')) IN ('TRAINING_COMPLETE', 'QUALIFIED')
  );

-- Keep can_sell_courses in sync on user profile changes
CREATE OR REPLACE FUNCTION sync_user_can_sell_courses()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.can_sell_courses := (
    UPPER(COALESCE(NEW.provider_status, '')) = 'VERIFIED_PROVIDER'
    OR LOWER(COALESCE(NEW.kyc_status, '')) IN ('verified', 'approved', 'ai_verified')
    OR UPPER(COALESCE(NEW.onboarding_status, '')) IN ('TRAINING_COMPLETE', 'QUALIFIED')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_sync_can_sell_courses ON users;
CREATE TRIGGER trg_users_sync_can_sell_courses
  BEFORE INSERT OR UPDATE OF provider_status, kyc_status, onboarding_status
  ON users
  FOR EACH ROW
  EXECUTE PROCEDURE sync_user_can_sell_courses();

-- Marketplace courses must not overlap Nexus module courses
UPDATE courses
SET is_marketplace = FALSE
WHERE is_marketplace = TRUE
  AND nexus_module IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courses_marketplace_nexus_exclusive'
  ) THEN
    ALTER TABLE courses
      ADD CONSTRAINT courses_marketplace_nexus_exclusive
      CHECK (NOT (is_marketplace = TRUE AND nexus_module IS NOT NULL));
  END IF;
END $$;

-- Marketplace status enum guard
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courses_marketplace_status_check'
  ) THEN
    ALTER TABLE courses
      ADD CONSTRAINT courses_marketplace_status_check
      CHECK (
        NOT is_marketplace
        OR status IN ('draft', 'in_review', 'published', 'rejected', 'unlisted')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_courses_marketplace_published_list
  ON courses (published_at DESC NULLS LAST)
  WHERE is_marketplace = TRUE AND status = 'published';

-- Seed demo course: link instructor + promo video
WITH seed_instructor AS (
  SELECT p.user_id
  FROM course_instructor_profiles p
  INNER JOIN courses c ON c.id = 'aqond-service-business-starter'
  ORDER BY p.created_at NULLS LAST, p.user_id
  LIMIT 1
),
fallback_instructor AS (
  SELECT id AS user_id
  FROM users
  WHERE UPPER(COALESCE(provider_status, '')) = 'VERIFIED_PROVIDER'
     OR can_sell_courses = TRUE
  ORDER BY created_at NULLS LAST
  LIMIT 1
),
picked AS (
  SELECT user_id FROM seed_instructor
  UNION ALL
  SELECT user_id FROM fallback_instructor
  LIMIT 1
)
UPDATE courses c
SET
  instructor_user_id = COALESCE(c.instructor_user_id, p.user_id),
  promo_video_url = COALESCE(
    NULLIF(TRIM(c.promo_video_url), ''),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  ),
  updated_at = NOW()
FROM picked p
WHERE c.id = 'aqond-service-business-starter';

-- Ensure seed instructor can sell (for studio demos)
UPDATE users u
SET can_sell_courses = TRUE
FROM courses c
WHERE c.id = 'aqond-service-business-starter'
  AND c.instructor_user_id = u.id
  AND u.can_sell_courses IS DISTINCT FROM TRUE;

INSERT INTO course_instructor_profiles (user_id, headline, bio, payout_eligible)
SELECT c.instructor_user_id, 'AQOND Academy', 'ทีมเนื้อหา AQOND สำหรับคอร์สเริ่มต้น', FALSE
FROM courses c
WHERE c.id = 'aqond-service-business-starter'
  AND c.instructor_user_id IS NOT NULL
ON CONFLICT (user_id) DO UPDATE
SET headline = COALESCE(course_instructor_profiles.headline, EXCLUDED.headline),
    bio = COALESCE(course_instructor_profiles.bio, EXCLUDED.bio),
    updated_at = NOW();
