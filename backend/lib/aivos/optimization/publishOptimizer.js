/**
 * Publish Optimizer – selects optimal platforms, posting times, and
 * content format for maximum reach and ROI.
 */
export function createPublishOptimizer(deps = {}) {
  const publishHistory = deps.publishHistory || null;
  const audienceLearning = deps.audienceLearning || null;
  const trendDetection = deps.trendDetection || null;

  const PLATFORM_DEFAULTS = {
    tiktok:    { bestHours: [18, 19, 20, 21], maxPerDay: 3 },
    youtube:   { bestHours: [14, 15, 16, 20], maxPerDay: 1 },
    instagram: { bestHours: [8, 11, 17, 19],  maxPerDay: 2 },
    facebook:  { bestHours: [9, 13, 19],       maxPerDay: 2 },
  };

  /**
   * Recommend which platforms to publish on and when.
   * @param {{ targetAudience?, budget?, contentType?, kpis? }} context
   * @returns {{ platforms: string[], schedule: object, confidence }}
   */
  function recommend(context = {}) {
    const { kpis = {}, budget = Infinity } = context;
    const platformScores = {};

    // Score platforms by historical performance
    if (publishHistory) {
      const stats = publishHistory.stats();
      for (const [platform, s] of Object.entries(stats.byPlatform || {})) {
        platformScores[platform] = s.published / Math.max(1, s.published + s.failed);
      }
    }

    // Apply trend boosts
    if (trendDetection) {
      const rising = trendDetection.rising();
      for (const t of rising) {
        const platform = t.metric.replace('publish.', '');
        if (platformScores[platform] !== undefined) {
          platformScores[platform] *= 1.2;
        }
      }
    }

    const ranked = Object.entries({ tiktok: 0.8, youtube: 0.7, instagram: 0.65, facebook: 0.6, ...platformScores })
      .sort((a, b) => b[1] - a[1])
      .map(([p]) => p);

    const platforms = ranked.slice(0, 3);
    const schedule = {};
    const now = new Date();
    for (const platform of platforms) {
      const defaults = PLATFORM_DEFAULTS[platform] || { bestHours: [18], maxPerDay: 1 };
      const nextHour = defaults.bestHours.find((h) => h > now.getHours()) || defaults.bestHours[0];
      const scheduledAt = new Date(now);
      scheduledAt.setHours(nextHour, 0, 0, 0);
      if (scheduledAt <= now) scheduledAt.setDate(scheduledAt.getDate() + 1);
      schedule[platform] = { scheduledAt: scheduledAt.toISOString(), maxPerDay: defaults.maxPerDay };
    }

    return { platforms, schedule, confidence: 0.75 };
  }

  return { recommend };
}

export default createPublishOptimizer;
