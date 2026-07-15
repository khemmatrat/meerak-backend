/**
 * Partner onboarding progress — persistence for Hermes voice onboarding (Phase 0).
 * Source of truth for the step *sequence* stays compassOnboarding.buildSteps();
 * this module only persists the snapshot + last_activity_at across sessions so that
 * (a) Hermes can be sequence-aware and (b) the Phase 3 nudge cron can find stalled users.
 */

const VALID_ZONES = new Set(['rider', 'merchant', 'partner_skill']);

/**
 * Idempotent schema ensure (mirrors migration 261). Called on boot so the table + nudge columns
 * exist in every environment without a separate migration step.
 */
export async function ensurePartnerOnboardingSchema(pool) {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partner_onboarding_progress (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
      firebase_uid      VARCHAR(255),
      phone             VARCHAR(20),
      zone              VARCHAR(20)  NOT NULL,
      primary_intent    VARCHAR(40),
      current_step      VARCHAR(60),
      steps_snapshot    JSONB NOT NULL DEFAULT '[]'::jsonb,
      status            VARCHAR(30) NOT NULL DEFAULT 'in_progress',
      line_user_id      VARCHAR(64),
      line_consent_at   TIMESTAMPTZ,
      fcm_token         TEXT,
      nudge_count       INT NOT NULL DEFAULT 0,
      last_nudge_at     TIMESTAMPTZ,
      nudge_opt_out     BOOLEAN NOT NULL DEFAULT FALSE,
      last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  // Defensive column adds (for a pre-existing table from an earlier partial apply)
  await pool.query(
    `ALTER TABLE partner_onboarding_progress ADD COLUMN IF NOT EXISTS line_consent_at TIMESTAMPTZ`,
  );
  await pool.query(
    `ALTER TABLE partner_onboarding_progress ADD COLUMN IF NOT EXISTS nudge_opt_out BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_pop_user_zone ON partner_onboarding_progress(user_id, zone) WHERE user_id IS NOT NULL`,
  );
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_pop_fb_zone ON partner_onboarding_progress(firebase_uid, zone) WHERE user_id IS NULL AND firebase_uid IS NOT NULL`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_pop_stall ON partner_onboarding_progress(status, last_activity_at)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_pop_phone ON partner_onboarding_progress(phone)`,
  );
}

function normalizeZone(zone) {
  const z = String(zone || '').toLowerCase();
  return VALID_ZONES.has(z) ? z : null;
}

/**
 * Upsert progress from a compass status object (result of buildCompassStatus()).
 * Keyed by (user_id, zone). Safe no-op if the table is missing (returns null).
 */
export async function upsertProgressFromStatus(pool, status, extra = {}) {
  if (!pool || !status?.userId) return null;
  const zone = normalizeZone(status.zone);
  if (!zone) return null;

  const currentStep = status?.nextAction?.id || null;
  const stepsSnapshot = JSON.stringify(status?.steps || []);
  const rowStatus = status?.allDone ? 'completed' : 'in_progress';
  const phone = extra.phone || null;
  const firebaseUid = extra.firebaseUid || null;

  try {
    const r = await pool.query(
      `INSERT INTO partner_onboarding_progress
         (user_id, firebase_uid, phone, zone, primary_intent, current_step, steps_snapshot, status, last_activity_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, now(), now())
       ON CONFLICT (user_id, zone) WHERE user_id IS NOT NULL
       DO UPDATE SET
         firebase_uid   = COALESCE(EXCLUDED.firebase_uid, partner_onboarding_progress.firebase_uid),
         phone          = COALESCE(EXCLUDED.phone, partner_onboarding_progress.phone),
         primary_intent = EXCLUDED.primary_intent,
         current_step   = EXCLUDED.current_step,
         steps_snapshot = EXCLUDED.steps_snapshot,
         status         = EXCLUDED.status,
         last_activity_at = now(),
         updated_at     = now()
       RETURNING *`,
      [
        status.userId,
        firebaseUid,
        phone,
        zone,
        status.primaryIntent || null,
        currentStep,
        stepsSnapshot,
        rowStatus,
      ],
    );
    return r.rows[0] || null;
  } catch (e) {
    // Table may not exist yet (migration not run) — degrade gracefully.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[partnerOnboardingProgress] upsert skipped:', e?.message || e);
    }
    return null;
  }
}

/** Read persisted progress row(s) for a user (optionally a single zone). */
export async function getProgress(pool, { userId, zone } = {}) {
  if (!pool || !userId) return null;
  try {
    if (zone) {
      const z = normalizeZone(zone);
      if (!z) return null;
      const r = await pool.query(
        `SELECT * FROM partner_onboarding_progress WHERE user_id = $1 AND zone = $2 LIMIT 1`,
        [userId, z],
      );
      return r.rows[0] || null;
    }
    const r = await pool.query(
      `SELECT * FROM partner_onboarding_progress WHERE user_id = $1 ORDER BY last_activity_at DESC`,
      [userId],
    );
    return r.rows;
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[partnerOnboardingProgress] read skipped:', e?.message || e);
    }
    return null;
  }
}

/** Bump last_activity_at (kept fresh so the nudge cron does not fire on active users). */
export async function touchProgress(pool, { userId, zone } = {}) {
  if (!pool || !userId) return null;
  const z = normalizeZone(zone);
  if (!z) return null;
  try {
    const r = await pool.query(
      `UPDATE partner_onboarding_progress
         SET last_activity_at = now(), updated_at = now()
       WHERE user_id = $1 AND zone = $2
       RETURNING *`,
      [userId, z],
    );
    return r.rows[0] || null;
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[partnerOnboardingProgress] touch skipped:', e?.message || e);
    }
    return null;
  }
}

export { VALID_ZONES, normalizeZone };
