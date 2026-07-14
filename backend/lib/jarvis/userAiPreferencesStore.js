/**
 * Sprint 31 — user_ai_preferences read/write (language_profile in context_json)
 */

import { randomUUID } from 'crypto';

const DEFAULT_PREFS = {
  jarvis_voice_enabled: true,
  jarvis_locale: 'th-TH',
  notify_ai_tips: true,
  context_json: {},
};

export async function loadUserAiPreferences(pool, userId) {
  if (!pool || !userId || userId === 'guest') {
    return { ...DEFAULT_PREFS, user_id: userId || 'guest' };
  }
  const r = await pool.query(
    `SELECT user_id, jarvis_voice_enabled, jarvis_locale, notify_ai_tips, context_json, updated_at
     FROM commerce.user_ai_preferences WHERE user_id = $1`,
    [userId],
  );
  if (!r.rows.length) {
    return { ...DEFAULT_PREFS, user_id: userId };
  }
  const row = r.rows[0];
  return {
    user_id: row.user_id,
    jarvis_voice_enabled: row.jarvis_voice_enabled,
    jarvis_locale: row.jarvis_locale,
    notify_ai_tips: row.notify_ai_tips,
    context_json: row.context_json || {},
    updated_at: row.updated_at,
  };
}

export async function mergeLanguageProfile(pool, userId, languageProfile) {
  if (!pool || !userId || userId === 'guest' || !languageProfile) {
    return { ok: false, reason: 'invalid_input' };
  }
  const prev = await loadUserAiPreferences(pool, userId);
  const context = {
    ...(prev.context_json || {}),
    language_profile: languageProfile,
  };
  const jarvisLocale = languageProfile.detected_lang || languageProfile.locale || prev.jarvis_locale;

  await pool.query(
    `INSERT INTO commerce.user_ai_preferences (user_id, jarvis_voice_enabled, jarvis_locale, notify_ai_tips, context_json, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       jarvis_locale = EXCLUDED.jarvis_locale,
       context_json = COALESCE(commerce.user_ai_preferences.context_json, '{}'::jsonb) || EXCLUDED.context_json,
       updated_at = NOW()`,
    [
      userId,
      prev.jarvis_voice_enabled ?? true,
      jarvisLocale,
      prev.notify_ai_tips ?? true,
      JSON.stringify({ language_profile: languageProfile }),
    ],
  );

  return {
    ok: true,
    preferences: {
      ...prev,
      jarvis_locale: jarvisLocale,
      context_json: context,
    },
  };
}

export async function mergeJarvisMemory(pool, userId, jarvisMemory) {
  if (!pool || !userId || userId === 'guest' || !jarvisMemory) {
    return { ok: false, reason: 'invalid_input' };
  }
  const prev = await loadUserAiPreferences(pool, userId);
  const context = {
    ...(prev.context_json || {}),
    jarvis_memory: jarvisMemory,
  };

  await pool.query(
    `INSERT INTO commerce.user_ai_preferences (user_id, jarvis_voice_enabled, jarvis_locale, notify_ai_tips, context_json, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       context_json = COALESCE(commerce.user_ai_preferences.context_json, '{}'::jsonb) || EXCLUDED.context_json,
       updated_at = NOW()`,
    [
      userId,
      prev.jarvis_voice_enabled ?? true,
      prev.jarvis_locale,
      prev.notify_ai_tips ?? true,
      JSON.stringify({ jarvis_memory: jarvisMemory }),
    ],
  );

  return { ok: true, preferences: { ...prev, context_json: context } };
}

export async function mergeJarvisSignals(pool, userId, signalPatch = {}) {
  if (!pool || !userId || userId === 'guest' || !signalPatch) {
    return { ok: false, reason: 'invalid_input' };
  }
  const prev = await loadUserAiPreferences(pool, userId);
  const signals = {
    ...(prev.context_json?.jarvis_signals || {}),
    ...signalPatch,
    updated_at: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO commerce.user_ai_preferences (user_id, jarvis_voice_enabled, jarvis_locale, notify_ai_tips, context_json, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       context_json = COALESCE(commerce.user_ai_preferences.context_json, '{}'::jsonb) || EXCLUDED.context_json,
       updated_at = NOW()`,
    [
      userId,
      prev.jarvis_voice_enabled ?? true,
      prev.jarvis_locale,
      prev.notify_ai_tips ?? true,
      JSON.stringify({ jarvis_signals: signals }),
    ],
  );

  return {
    ok: true,
    jarvis_signals: signals,
  };
}
