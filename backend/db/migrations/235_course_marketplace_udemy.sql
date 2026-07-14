-- 235: Course Marketplace — Udemy-style authoring, enrollment, wallet purchase
-- Isolated from existing job/booking/payment handlers. Extends LMS tables only.

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS instructor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subtitle TEXT,
  ADD COLUMN IF NOT EXISTS price_thb NUMERIC(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_price_thb NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'THB',
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS is_marketplace BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS promo_video_url TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_variants JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS language VARCHAR(20) DEFAULT 'th',
  ADD COLUMN IF NOT EXISTS learning_outcomes JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS requirements JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS total_enrolled INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE course_lessons
  ADD COLUMN IF NOT EXISTS section_id UUID,
  ADD COLUMN IF NOT EXISTS is_preview BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS resource_urls JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS watched_seconds_required INT DEFAULT 0;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_sell_courses BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS course_instructor_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  headline TEXT,
  bio TEXT,
  avatar_url TEXT,
  payout_eligible BOOLEAN DEFAULT FALSE,
  revenue_share_override NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'course_lessons' AND constraint_name = 'fk_course_lessons_section'
  ) THEN
    ALTER TABLE course_lessons
      ADD CONSTRAINT fk_course_lessons_section
      FOREIGN KEY (section_id) REFERENCES course_sections(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS course_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  source VARCHAR(30) DEFAULT 'purchase',
  progress_pct NUMERIC(5,2) DEFAULT 0,
  completed_at TIMESTAMPTZ,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS course_lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  watched_seconds INT DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS saved_marketplace_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS course_purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  instructor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  gross_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  platform_fee NUMERIC(18,2) NOT NULL DEFAULT 0,
  instructor_net NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'THB',
  status VARCHAR(30) DEFAULT 'completed',
  ledger_id VARCHAR(100),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS course_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS course_questions_qa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES course_lessons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES course_questions_qa(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trainee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  note TEXT,
  status VARCHAR(30) DEFAULT 'recommended',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (coach_id, trainee_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_courses_marketplace_status ON courses(is_marketplace, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_sections_course ON course_sections(course_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_user ON course_enrollments(user_id, enrolled_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_lesson_progress_user_course ON course_lesson_progress(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_course_purchase_orders_instructor ON course_purchase_orders(instructor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_reviews_course ON course_reviews(course_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'payment_ledger_audit' AND constraint_name = 'payment_ledger_audit_event_type_check'
  ) THEN
    ALTER TABLE payment_ledger_audit DROP CONSTRAINT payment_ledger_audit_event_type_check;
    ALTER TABLE payment_ledger_audit ADD CONSTRAINT payment_ledger_audit_event_type_check
      CHECK (event_type IN (
        'payment_created','payment_completed','payment_failed','payment_expired','payment_refunded',
        'escrow_held','escrow_released','escrow_refunded',
        'insurance_liability_credit','insurance_withdrawal',
        'booking_refund','booking_fee','talent_booking_payout',
        'vip_subscription','post_job_fee','branding_package_payout',
        'user_payout_withdrawal','wallet_deposit','wallet_tip',
        'coach_training_fee','trainee_net_income','certified_statement_fee',
        'no_show_refund','no_show_fine',
        'referral_bonus','referral_budget_exhausted',
        'withdrawal_fee_income','provider_wht_withheld',
        'admin_credit','admin_debit',
        'insurance_replacement_payout','platform_stability_reserve','reroute_replacement_payout',
        'marine_deposit_held','marine_deposit_released','marine_deposit_refund','marine_compensation_captain',
        'emergency_net_purchase','intercity_cancel',
        'promo_discount_subsidy','prb_payment','prb_promo_credit',
        'course_purchase','course_instructor_payout'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'platform_revenues' AND constraint_name = 'platform_revenues_source_type_check'
  ) THEN
    ALTER TABLE platform_revenues DROP CONSTRAINT platform_revenues_source_type_check;
    ALTER TABLE platform_revenues ADD CONSTRAINT platform_revenues_source_type_check
      CHECK (source_type IN (
        'withdrawal_fee_margin',
        'deposit_margin_promptpay',
        'deposit_margin_truemoney',
        'deposit_margin_card',
        'deposit_margin_payso',
        'deposit_margin_ksher',
        'insurance_premium',
        'match_job_commission',
        'booking_fee',
        'advance_job_commission',
        'wallet_deposit_margin',
        'other_platform_fee',
        'course_commission'
      ));
  END IF;
END $$;

INSERT INTO courses (
  id, title, subtitle, description, category, duration, level, image_url,
  price_thb, original_price_thb, currency, status, is_marketplace, language,
  learning_outcomes, requirements, published_at, total_enrolled, rating_avg, rating_count
) VALUES (
  'aqond-service-business-starter',
  'สร้างรายได้จากงานบริการบน AQOND',
  'คอร์สเริ่มต้นสำหรับคนอยากขายบริการและปิดงานอย่างมืออาชีพ',
  'เรียนรู้การตั้งโปรไฟล์ การตั้งราคา การสื่อสารกับลูกค้า และการดูแลหลังการขายสำหรับงานบริการ',
  'business',
  90,
  'beginner',
  'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200',
  499,
  1290,
  'THB',
  'published',
  TRUE,
  'th',
  '["ตั้งโปรไฟล์ให้ลูกค้าเชื่อถือ","ออกแบบแพ็กเกจบริการที่ขายง่าย","สื่อสารก่อนรับงานอย่างมืออาชีพ","วางระบบรีวิวและงานซ้ำ"]'::jsonb,
  '["เหมาะสำหรับผู้เริ่มต้น","มีบัญชี AQOND และพร้อมเรียนผ่านมือถือ"]'::jsonb,
  NOW(),
  0,
  0,
  0
) ON CONFLICT (id) DO NOTHING;

INSERT INTO course_instructor_profiles (user_id, headline, bio, payout_eligible)
SELECT id, 'AQOND Academy', 'ทีมเนื้อหา AQOND สำหรับคอร์สเริ่มต้น', FALSE
FROM users
ORDER BY created_at NULLS LAST
LIMIT 1
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO course_sections (course_id, title, sort_order)
VALUES ('aqond-service-business-starter', 'เริ่มต้นขายบริการให้ดูมืออาชีพ', 1)
ON CONFLICT DO NOTHING;
