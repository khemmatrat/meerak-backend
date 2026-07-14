import { HABIT_STREAK_MILESTONES } from '../config.js';
import { assertGrowthWriteOwner } from '../domain/ownershipMatrix.js';
import { emitGrowthEvent } from '../growthEmit.js';

export function createHabitEngine({ storage, metrics, audit, events } = {}) {
  const owner = 'growth.habit';
  const table = storage.tables.habits;

  function userKey(tenantId, userId) {
    return storage.key(tenantId, userId);
  }

  function defaultHabit(tenantId, userId) {
    return {
      habitId: `habit-daily-${userId}`,
      tenantId,
      userId,
      cadence: 'daily',
      streak: 0,
      longestStreak: 0,
      lastCompletedAt: null,
      completions: [],
      milestones: [],
      status: 'active',
    };
  }

  function checkMilestones(habit) {
    const milestones = [...habit.milestones];
    for (const days of HABIT_STREAK_MILESTONES) {
      if (habit.streak >= days && !milestones.find((m) => m.days === days)) {
        milestones.push({
          days,
          label: `${days}-day streak`,
          rewardPoints: days * 5,
          achievedAt: storage.now(),
        });
      }
    }
    return milestones;
  }

  return {
    get({ tenantId, userId }) {
      return storage.get(table, userKey(tenantId, userId)) || defaultHabit(tenantId, userId);
    },

    list({ tenantId, userId }) {
      const habit = this.get({ tenantId, userId });
      return [habit];
    },

    record({ tenantId, userId }, { habitId, note } = {}) {
      assertGrowthWriteOwner(owner, table);
      const habit = this.get({ tenantId, userId });
      const today = new Date().toISOString().slice(0, 10);
      const lastDay = habit.lastCompletedAt?.slice(0, 10);
      let streak = habit.streak;

      if (lastDay === today) {
        return { ok: true, habit, duplicate: true };
      }

      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (lastDay === yesterday) streak += 1;
      else streak = 1;

      const completion = { at: storage.now(), habitId: habitId || habit.habitId, note: note || null };
      const next = {
        ...habit,
        streak,
        longestStreak: Math.max(habit.longestStreak, streak),
        lastCompletedAt: storage.now(),
        completions: [...habit.completions, completion],
        milestones: checkMilestones({ ...habit, streak }),
      };
      storage.put(table, userKey(tenantId, userId), next);
      metrics?.record?.({ tenantId, action: 'habit.record', success: true });
      audit?.record?.({ action: 'habit.record', tenantId, diff: { userId, streak } });
      void emitGrowthEvent(events, 'growth.habit.completed', { streak }, { tenantId, userId, correlationId: `habit-${userId}` });
      return { ok: true, habit: next };
    },
  };
}
