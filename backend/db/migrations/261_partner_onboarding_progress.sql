-- Partner onboarding progress — persistence + activity layer for Hermes voice onboarding.
-- Source of truth for step sequence stays compassOnboarding.buildSteps(); this table only
-- persists snapshot + last_activity_at (for future nudge cron) across sessions / pre-account.
-- Covers 3 zones: rider | merchant | partner_skill.

CREATE TABLE IF NOT EXISTS partner_onboarding_progress (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- identity: pre-account อาจยังไม่มี user_id → key รองด้วย firebase_uid / phone
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  firebase_uid      VARCHAR(255),
  phone             VARCHAR(20),
  -- zone / track
  zone              VARCHAR(20)  NOT NULL,                 -- 'rider' | 'merchant' | 'partner_skill'
  primary_intent    VARCHAR(40),                           -- rider_delivery | provider_service | open_shop | technical | ...
  -- step tracking (Source of Truth = compassOnboarding.buildSteps())
  current_step      VARCHAR(60),                           -- step.id เช่น 'personal_kyc','category_pack','module2','create_shop'
  steps_snapshot    JSONB NOT NULL DEFAULT '[]'::jsonb,    -- cache buildSteps(): [{id,label,done,href,minutes}]
  status            VARCHAR(30) NOT NULL DEFAULT 'in_progress', -- in_progress | stalled | completed | abandoned
  -- nudge (Phase 3)
  line_user_id      VARCHAR(64),
  line_consent_at   TIMESTAMPTZ,                           -- ยินยอมรับข้อความผ่าน LINE (ต้องมีก่อนส่ง LINE nudge)
  fcm_token         TEXT,
  nudge_count       INT NOT NULL DEFAULT 0,                -- lifetime cap กันสแปม (หยุดเมื่อถึง NUDGE_MAX_TOTAL)
  last_nudge_at     TIMESTAMPTZ,
  nudge_opt_out     BOOLEAN NOT NULL DEFAULT FALSE,        -- user ปิดการเตือน onboarding (opt-out)
  -- activity
  last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1 progress ต่อ identity+zone (post-account ใช้ user_id, pre-account ใช้ firebase_uid)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pop_user_zone
  ON partner_onboarding_progress(user_id, zone) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pop_fb_zone
  ON partner_onboarding_progress(firebase_uid, zone) WHERE user_id IS NULL AND firebase_uid IS NOT NULL;
-- nudge cron (Phase 3) จะ query จาก (status,last_activity_at)
CREATE INDEX IF NOT EXISTS idx_pop_stall ON partner_onboarding_progress(status, last_activity_at);
CREATE INDEX IF NOT EXISTS idx_pop_phone ON partner_onboarding_progress(phone);
