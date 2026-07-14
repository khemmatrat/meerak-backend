/**
 * commerce.user_experience_profiles — read/write (Sprint 30c)
 */

export async function loadExperienceProfile(pool, { userId, guestId } = {}) {
  if (!pool) return null;
  if (userId) {
    const r = await pool.query(
      `SELECT * FROM commerce.user_experience_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    return r.rows[0] || null;
  }
  if (guestId) {
    const r = await pool.query(
      `SELECT * FROM commerce.user_experience_profiles WHERE guest_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [guestId],
    );
    return r.rows[0] || null;
  }
  return null;
}

export function profileToClient(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    guestId: row.guest_id,
    lifecycleStage: row.lifecycle_stage,
    primaryIntent: row.primary_intent,
    secondaryIntents: row.secondary_intents || [],
    hiddenIntents: row.hidden_intents || [],
    birthDate: row.birth_date,
    email: row.email,
    referralCode: row.referral_code,
    country: row.country,
    language: row.language,
    referralSource: row.referral_source,
    wizardCompletedAt: row.wizard_completed_at,
    tourCompletedAt: row.tour_completed_at,
    tourSkipped: row.tour_skipped,
    intentGraph: row.intent_graph || {},
    contextJson: row.context_json || {},
  };
}

export async function markTourComplete(pool, { userId, skipped = false } = {}) {
  if (!pool || !userId) return null;
  const now = new Date().toISOString();
  const r = await pool.query(
    `UPDATE commerce.user_experience_profiles
     SET tour_completed_at = $2,
         tour_skipped = $3,
         lifecycle_stage = CASE WHEN lifecycle_stage = 'new_user' THEN 'activated' ELSE lifecycle_stage END,
         updated_at = NOW()
     WHERE user_id = $1
     RETURNING *`,
    [userId, now, Boolean(skipped)],
  );
  return r.rows[0] || null;
}

/**
 * @param {import('pg').Pool} pool
 * @param {object} input
 */
export async function upsertExperienceProfile(pool, input = {}) {
  const userId = input.user_id || input.userId;
  if (!pool || !userId) return null;

  const wizardComplete = Boolean(input.wizard_completed_at || input.complete_wizard);
  const wizardCompletedAt = input.wizard_completed_at
    || (wizardComplete ? new Date().toISOString() : null);

  const r = await pool.query(
    `INSERT INTO commerce.user_experience_profiles (
       user_id, guest_id, lifecycle_stage, primary_intent, secondary_intents, hidden_intents,
       intent_graph, birth_date, email, referral_code, country, language, referral_source,
       wizard_completed_at, context_json, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, NOW()
     )
     ON CONFLICT (user_id) DO UPDATE SET
       guest_id = COALESCE(EXCLUDED.guest_id, commerce.user_experience_profiles.guest_id),
       lifecycle_stage = CASE
         WHEN EXCLUDED.wizard_completed_at IS NOT NULL THEN 'new_user'
         ELSE commerce.user_experience_profiles.lifecycle_stage
       END,
       primary_intent = COALESCE(EXCLUDED.primary_intent, commerce.user_experience_profiles.primary_intent),
       secondary_intents = CASE
         WHEN EXCLUDED.primary_intent IS NOT NULL THEN EXCLUDED.secondary_intents
         ELSE commerce.user_experience_profiles.secondary_intents
       END,
       hidden_intents = CASE
         WHEN EXCLUDED.primary_intent IS NOT NULL THEN EXCLUDED.hidden_intents
         ELSE commerce.user_experience_profiles.hidden_intents
       END,
       intent_graph = CASE
         WHEN EXCLUDED.primary_intent IS NOT NULL THEN EXCLUDED.intent_graph
         ELSE commerce.user_experience_profiles.intent_graph
       END,
       birth_date = COALESCE(EXCLUDED.birth_date, commerce.user_experience_profiles.birth_date),
       email = COALESCE(EXCLUDED.email, commerce.user_experience_profiles.email),
       referral_code = COALESCE(EXCLUDED.referral_code, commerce.user_experience_profiles.referral_code),
       country = COALESCE(EXCLUDED.country, commerce.user_experience_profiles.country),
       language = COALESCE(EXCLUDED.language, commerce.user_experience_profiles.language),
       referral_source = COALESCE(EXCLUDED.referral_source, commerce.user_experience_profiles.referral_source),
       wizard_completed_at = COALESCE(EXCLUDED.wizard_completed_at, commerce.user_experience_profiles.wizard_completed_at),
       context_json = commerce.user_experience_profiles.context_json || EXCLUDED.context_json,
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      input.guest_id || input.guestId || null,
      wizardComplete ? 'new_user' : (input.lifecycle_stage || 'visitor'),
      input.primary_intent || input.primaryIntent || null,
      JSON.stringify(input.secondary_intents || input.secondaryIntents || []),
      JSON.stringify(input.hidden_intents || input.hiddenIntents || []),
      JSON.stringify(input.intent_graph || input.intentGraph || {}),
      input.birth_date || input.birthDate || null,
      input.email || null,
      input.referral_code || input.referralCode || null,
      input.country || null,
      input.language || null,
      input.referral_source || input.referralSource || null,
      wizardCompletedAt,
      JSON.stringify(input.context || input.context_json || {}),
    ],
  );
  return r.rows[0] || null;
}
