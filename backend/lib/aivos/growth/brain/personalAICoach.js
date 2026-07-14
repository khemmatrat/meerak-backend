export function coach(user = {}, context = {}) {
  const persona = user.persona || context.persona || 'general';
  const insights = {
    food: 'You should focus on menu content and daily specials today',
    marketplace: 'You should focus on marketplace today',
    resume: 'Update your resume with your latest achievement',
    general: 'Complete your highest-priority mission first',
  };
  const actions = {
    food: 'Post today\'s special',
    marketplace: 'Upload 1 product',
    resume: 'Add one bullet to your resume',
    general: 'Start your top mission',
  };
  const key = Object.keys(insights).find((k) => persona.includes(k)) || 'general';
  return {
    insight: insights[key],
    nextBestAction: actions[key],
    persona,
    generatedAt: new Date().toISOString(),
  };
}

export function createPersonalAICoach({ profile } = {}) {
  return {
    advise(ctx, context = {}) {
      const prof = profile?.get?.(ctx) || {};
      return { ok: true, ...coach(prof, context) };
    },
  };
}
