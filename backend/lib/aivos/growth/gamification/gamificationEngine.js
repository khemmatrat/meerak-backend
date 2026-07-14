export function createGamificationEngine({ loyalty, habit } = {}) {
  const BADGES = Object.freeze([
    { id: 'first-mission', label: 'First Mission', minLevel: 0 },
    { id: 'streak-7', label: '7-Day Streak', minStreak: 7 },
    { id: 'pro-level', label: 'Pro Level', minLevel: 5 },
  ]);

  return {
    snapshot(ctx) {
      const loyaltyRow = loyalty?.get?.(ctx) || { level: 0 };
      const habits = habit?.list?.(ctx) || [];
      const streak = habits[0]?.streak || 0;
      const badges = BADGES.filter((b) => {
        if (b.minLevel != null && loyaltyRow.level >= b.minLevel) return true;
        if (b.minStreak != null && streak >= b.minStreak) return true;
        return false;
      });
      return {
        level: loyaltyRow.level,
        xp: loyaltyRow.xp || 0,
        coins: loyaltyRow.coins || 0,
        streak,
        badges,
      };
    },
  };
}
