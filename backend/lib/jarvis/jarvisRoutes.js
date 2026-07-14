/**
 * Sprint 31 — Jarvis Language Intelligence API (additive)
 */

import { detectLanguageIntelligence, isJarvisLangIntelEnabled } from './languageIntelligence.js';
import {
  buildMemorySummary,
  isJarvisMemoryEnabled,
  mergeConversationTurn,
  normalizeJarvisMemory,
} from './conversationMemory.js';
import { loadUserAiPreferences, mergeLanguageProfile, mergeJarvisMemory } from './userAiPreferencesStore.js';
import { isJarvisPersonaEnabled, resolveJarvisPersona } from './personaEngine.js';
import { dismissJarvisBrief as dismissBriefRecord } from './proactiveAssistant.js';
import { isJarvisVoiceEnabled, resolveJarvisVoiceProfile } from './voiceIntelligence.js';

export function attachJarvisRoutes(app, deps = {}) {
  const { pool, optionalAuth } = deps;

  app.get('/api/jarvis/language-profile', optionalAuth || ((_r, _s, n) => n()), async (req, res) => {
    try {
      const userId = req.user?.id || req.query.userId || null;
      if (!userId) return res.status(400).json({ error: 'userId required' });
      const prefs = await loadUserAiPreferences(pool, userId);
      res.json({
        ok: true,
        enabled: isJarvisLangIntelEnabled(),
        preferences: prefs,
        language_profile: prefs.context_json?.language_profile || null,
      });
    } catch (e) {
      console.error('jarvis language-profile GET:', e);
      res.status(500).json({ error: 'language_profile_failed' });
    }
  });

  app.post('/api/jarvis/language-profile', optionalAuth || ((_r, _s, n) => n()), async (req, res) => {
    try {
      const body = req.body || {};
      const userId = req.user?.id || body.user_id || null;
      const message = String(body.message || body.user_message || '').trim();
      if (!message) return res.status(400).json({ error: 'message required' });

      const prefs = userId ? await loadUserAiPreferences(pool, userId) : null;
      const profile = detectLanguageIntelligence({
        message,
        acceptLanguage: req.headers['accept-language'],
        storedProfile: prefs?.context_json?.language_profile,
        jarvisLocale: prefs?.jarvis_locale || body.jarvis_locale,
        countryHint: body.country_hint,
      });

      let saved = null;
      if (userId && pool) {
        saved = await mergeLanguageProfile(pool, userId, profile);
      }

      res.json({
        ok: true,
        enabled: isJarvisLangIntelEnabled(),
        language_profile: profile,
        persisted: Boolean(saved?.ok),
        stub: !pool,
      });
    } catch (e) {
      console.error('jarvis language-profile POST:', e);
      res.status(500).json({ error: 'language_profile_failed' });
    }
  });

  app.get('/api/jarvis/memory', optionalAuth || ((_r, _s, n) => n()), async (req, res) => {
    try {
      const userId = req.user?.id || req.query.userId || null;
      if (!userId) return res.status(400).json({ error: 'userId required' });
      const prefs = await loadUserAiPreferences(pool, userId);
      const memory = normalizeJarvisMemory(prefs.context_json || {});
      const summary = buildMemorySummary(prefs.context_json || {}, {});
      res.json({
        ok: true,
        enabled: isJarvisMemoryEnabled(),
        jarvis_memory: memory,
        summary,
        stub: !pool,
      });
    } catch (e) {
      console.error('jarvis memory GET:', e);
      res.status(500).json({ error: 'jarvis_memory_failed' });
    }
  });

  app.post('/api/jarvis/memory/merge', optionalAuth || ((_r, _s, n) => n()), async (req, res) => {
    try {
      const body = req.body || {};
      const userId = req.user?.id || body.user_id || null;
      if (!userId) return res.status(400).json({ error: 'user_id required' });
      if (!isJarvisMemoryEnabled()) {
        return res.json({ ok: true, skipped: true, enabled: false });
      }

      const prefs = await loadUserAiPreferences(pool, userId);
      let experienceProfile = null;
      if (pool) {
        const er = await pool
          .query(
            `SELECT primary_intent FROM commerce.user_experience_profiles WHERE user_id = $1 LIMIT 1`,
            [userId],
          )
          .catch(() => ({ rows: [] }));
        experienceProfile = er.rows[0] || null;
      }

      const jarvisMemory = mergeConversationTurn({
        contextJson: prefs.context_json || {},
        userMessage: body.user_message || '',
        jarvisReply: body.jarvis_reply || '',
        action: body.action || 'none',
        session: body.session || {},
        experienceProfile,
      });

      const saved = pool ? await mergeJarvisMemory(pool, userId, jarvisMemory) : null;
      const summary = buildMemorySummary(
        { ...(prefs.context_json || {}), jarvis_memory: jarvisMemory },
        body.session || {},
      );

      res.json({
        ok: true,
        enabled: true,
        jarvis_memory: jarvisMemory,
        summary,
        persisted: Boolean(saved?.ok),
        stub: !pool,
      });
    } catch (e) {
      console.error('jarvis memory merge:', e);
      res.status(500).json({ error: 'jarvis_memory_merge_failed' });
    }
  });

  app.get('/api/jarvis/persona', optionalAuth || ((_r, _s, n) => n()), async (req, res) => {
    try {
      const userId = req.user?.id || req.query.userId || null;
      const message = String(req.query.message || '').trim();
      const prefs = userId && pool ? await loadUserAiPreferences(pool, userId) : null;
      let languageProfile = prefs?.context_json?.language_profile || {};
      if (message && isJarvisLangIntelEnabled()) {
        languageProfile = detectLanguageIntelligence({
          message,
          acceptLanguage: req.headers['accept-language'],
          storedProfile: languageProfile,
          jarvisLocale: prefs?.jarvis_locale,
          countryHint: req.query.country_hint,
        });
      }
      const jarvisPersona = await resolveJarvisPersona({
        languageProfile,
        contextJson: prefs?.context_json || {},
        surface: req.query.surface || null,
        userId,
        feedContext: req.query.is_food === '1' ? { is_food: true } : null,
      });
      res.json({
        ok: true,
        enabled: isJarvisPersonaEnabled(),
        jarvis_persona: jarvisPersona,
        language_profile: languageProfile,
        stub: !pool,
      });
    } catch (e) {
      console.error('jarvis persona GET:', e);
      res.status(500).json({ error: 'jarvis_persona_failed' });
    }
  });

  app.post('/api/jarvis/brief-dismiss', optionalAuth || ((_r, _s, n) => n()), async (req, res) => {
    try {
      const body = req.body || {};
      const userId = req.user?.id || body.user_id || null;
      const briefId = String(body.brief_id || body.id || '').trim();
      if (!userId) return res.status(400).json({ error: 'user_id required' });
      if (!briefId) return res.status(400).json({ error: 'brief_id required' });
      const result = await dismissBriefRecord(pool, userId, briefId);
      res.json({ ...result, enabled: true, stub: !pool });
    } catch (e) {
      console.error('jarvis brief-dismiss:', e);
      res.status(500).json({ error: 'jarvis_brief_dismiss_failed' });
    }
  });

  app.get('/api/jarvis/voice-profile', optionalAuth || ((_r, _s, n) => n()), async (req, res) => {
    try {
      const userId = req.user?.id || req.query.userId || null;
      const prefs = userId && pool ? await loadUserAiPreferences(pool, userId) : null;
      const contextJson = prefs?.context_json || {};
      const languageProfile = contextJson.language_profile || {};
      let jarvisPersona = null;
      if (isJarvisPersonaEnabled()) {
        jarvisPersona = await resolveJarvisPersona({
          languageProfile,
          contextJson,
          surface: req.query.surface || null,
          userId,
        });
      }
      const voiceProfile = resolveJarvisVoiceProfile({
        languageProfile,
        jarvisPersona,
        country: req.query.country || languageProfile.country,
      });
      res.json({
        ok: true,
        enabled: isJarvisVoiceEnabled(),
        jarvis_voice_enabled: prefs?.jarvis_voice_enabled ?? true,
        voice_profile: voiceProfile,
        stub: !pool,
      });
    } catch (e) {
      console.error('jarvis voice-profile GET:', e);
      res.status(500).json({ error: 'jarvis_voice_profile_failed' });
    }
  });
}
