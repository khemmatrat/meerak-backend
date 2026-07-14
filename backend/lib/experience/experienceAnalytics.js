/**
 * Sprint 30e — FTX / Experience Engine admin analytics
 */

const FUNNEL_EVENT_TYPES = [
  'experience.first_launch',
  'ftx.welcome_shown',
  'ftx.welcome_dismissed',
  'ftx.welcome_explore',
  'ftx.welcome_wizard_cta',
  'ftx.wizard_started',
  'ftx.wizard_completed',
  'ftx.wizard_skipped',
  'ftx.tour_started',
  'ftx.tour_completed',
  'ftx.tour_skipped',
  'ftx.jarvis_greet_shown',
];

const FUNNEL_LABELS = {
  'experience.first_launch': 'First launch',
  'ftx.welcome_shown': 'Welcome shown',
  'ftx.welcome_dismissed': 'Welcome dismissed',
  'ftx.welcome_explore': 'Welcome explore',
  'ftx.welcome_wizard_cta': 'Wizard CTA',
  'ftx.wizard_started': 'Wizard started',
  'ftx.wizard_completed': 'Wizard completed',
  'ftx.wizard_skipped': 'Wizard skipped',
  'ftx.tour_started': 'Tour started',
  'ftx.tour_completed': 'Tour completed',
  'ftx.tour_skipped': 'Tour skipped',
  'ftx.jarvis_greet_shown': 'Jarvis greet',
};

function clampDays(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 30;
  return Math.min(n, 90);
}

function funnelStep(rows, eventType) {
  const row = rows.find((r) => r.event_type === eventType);
  return {
    eventType,
    label: FUNNEL_LABELS[eventType] || eventType,
    events: row?.events || 0,
    actors: row?.actors || 0,
  };
}

export async function getFtxDashboard(pool, { rangeDays = 30 } = {}) {
  if (!pool) {
    return {
      rangeDays: clampDays(rangeDays),
      generatedAt: new Date().toISOString(),
      stub: true,
      summary: {},
      funnel: [],
      eventCounts: [],
      dailyEvents: [],
      referralSources: [],
      primaryIntents: [],
      guestVsRegistered: { guests: 0, registered: 0 },
      retention: { multiDayActors: 0, totalActors: 0 },
    };
  }

  const days = clampDays(rangeDays);
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fromIso = fromDate.toISOString();

  const [
    eventCountsRes,
    funnelRes,
    dailyRes,
    referralRes,
    intentRes,
    guestRegRes,
    retentionRes,
    profileSummaryRes,
    dailyProfilesRes,
  ] = await Promise.all([
    pool.query(
      `SELECT event_type, COUNT(*)::int AS n
       FROM commerce.experience_events
       WHERE created_at >= $1
         AND event_type NOT LIKE '%regression_probe%'
         AND event_type NOT LIKE '%rollout_probe%'
       GROUP BY event_type
       ORDER BY n DESC
       LIMIT 50`,
      [fromIso],
    ),
    pool.query(
      `SELECT event_type,
              COUNT(*)::int AS events,
              COUNT(DISTINCT COALESCE(user_id, guest_id))::int AS actors
       FROM commerce.experience_events
       WHERE created_at >= $1
         AND event_type = ANY($2::text[])
       GROUP BY event_type`,
      [fromIso, FUNNEL_EVENT_TYPES],
    ),
    pool.query(
      `SELECT created_at::date AS day, COUNT(*)::int AS n
       FROM commerce.experience_events
       WHERE created_at >= $1
         AND event_type NOT LIKE '%probe%'
       GROUP BY created_at::date
       ORDER BY day`,
      [fromIso],
    ),
    pool.query(
      `SELECT COALESCE(NULLIF(TRIM(referral_source), ''), 'unknown') AS source,
              COUNT(*)::int AS n
       FROM commerce.user_experience_profiles
       WHERE referral_source IS NOT NULL
         AND updated_at >= $1
       GROUP BY source
       ORDER BY n DESC
       LIMIT 15`,
      [fromIso],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT COALESCE(NULLIF(TRIM(primary_intent), ''), 'unknown') AS intent,
              COUNT(*)::int AS n
       FROM commerce.user_experience_profiles
       WHERE primary_intent IS NOT NULL
       GROUP BY intent
       ORDER BY n DESC
       LIMIT 20`,
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT
         COUNT(DISTINCT guest_id) FILTER (
           WHERE guest_id IS NOT NULL AND user_id IS NULL
         )::int AS guests,
         COUNT(DISTINCT user_id) FILTER (
           WHERE user_id IS NOT NULL
         )::int AS registered
       FROM commerce.experience_events
       WHERE created_at >= $1`,
      [fromIso],
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS multi_day_actors
       FROM (
         SELECT COALESCE(user_id, guest_id) AS actor, COUNT(DISTINCT created_at::date) AS days
         FROM commerce.experience_events
         WHERE created_at >= $1
           AND COALESCE(user_id, guest_id) IS NOT NULL
           AND event_type NOT LIKE '%probe%'
         GROUP BY actor
         HAVING COUNT(DISTINCT created_at::date) >= 2
       ) t`,
      [fromIso],
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS profiles_total,
         COUNT(*) FILTER (WHERE wizard_completed_at IS NOT NULL)::int AS wizard_completed,
         COUNT(*) FILTER (WHERE tour_completed_at IS NOT NULL)::int AS tour_completed,
         COUNT(*) FILTER (WHERE tour_skipped = TRUE)::int AS tour_skipped_profiles,
         COUNT(*) FILTER (WHERE wizard_completed_at >= $1)::int AS wizard_completed_in_range,
         COUNT(*) FILTER (WHERE tour_completed_at >= $1)::int AS tour_completed_in_range
       FROM commerce.user_experience_profiles`,
      [fromIso],
    ).catch(() => ({
      rows: [{
        profiles_total: 0,
        wizard_completed: 0,
        tour_completed: 0,
        tour_skipped_profiles: 0,
        wizard_completed_in_range: 0,
        tour_completed_in_range: 0,
      }],
    })),
    pool.query(
      `SELECT wizard_completed_at::date AS day, COUNT(*)::int AS n
       FROM commerce.user_experience_profiles
       WHERE wizard_completed_at >= $1
       GROUP BY wizard_completed_at::date
       ORDER BY day`,
      [fromIso],
    ).catch(() => ({ rows: [] })),
  ]);

  const funnelRows = funnelRes.rows || [];
  const funnel = FUNNEL_EVENT_TYPES.map((t) => funnelStep(funnelRows, t));

  const guestReg = guestRegRes.rows[0] || { guests: 0, registered: 0 };
  const retention = retentionRes.rows[0] || { multi_day_actors: 0 };
  const totalActors =
    (guestReg.guests || 0) + (guestReg.registered || 0) > 0
      ? Math.max(guestReg.guests || 0, 0) + Math.max(guestReg.registered || 0, 0)
      : funnel.find((f) => f.eventType === 'experience.first_launch')?.actors || 0;

  const profileSummary = profileSummaryRes.rows[0] || {};

  return {
    rangeDays: days,
    generatedAt: new Date().toISOString(),
    stub: false,
    rollout: {
      version: '30e',
      killSwitch: process.env.AIVOS_EXPERIENCE_KILL === '1',
      experienceEnabled: process.env.AIVOS_EXPERIENCE_ENABLED === '1',
      ftxEnabled: process.env.AIVOS_EXPERIENCE_FTX === '1',
    },
    summary: {
      profilesTotal: profileSummary.profiles_total || 0,
      wizardCompleted: profileSummary.wizard_completed || 0,
      tourCompleted: profileSummary.tour_completed || 0,
      tourSkippedProfiles: profileSummary.tour_skipped_profiles || 0,
      wizardCompletedInRange: profileSummary.wizard_completed_in_range || 0,
      tourCompletedInRange: profileSummary.tour_completed_in_range || 0,
    },
    funnel,
    eventCounts: eventCountsRes.rows || [],
    dailyEvents: dailyRes.rows || [],
    dailyWizardCompletions: dailyProfilesRes.rows || [],
    referralSources: referralRes.rows || [],
    primaryIntents: intentRes.rows || [],
    guestVsRegistered: {
      guests: guestReg.guests || 0,
      registered: guestReg.registered || 0,
    },
    retention: {
      multiDayActors: retention.multi_day_actors || 0,
      totalActors,
      retentionPct:
        totalActors > 0
          ? Math.round(((retention.multi_day_actors || 0) / totalActors) * 1000) / 10
          : 0,
    },
  };
}
