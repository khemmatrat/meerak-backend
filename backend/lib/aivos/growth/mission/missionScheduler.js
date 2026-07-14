import { isGrowthEnabled } from '../config.js';

export function generateMission({ journey = {}, habit = {}, revenue = {} } = {}) {
  const stage = journey.fsmState || journey.currentStage || 'ONBOARDING';
  const missions = [
    {
      id: 'm1',
      templateId: 'post-content',
      title: 'Post Content',
      reward: 50,
      priority: 90,
    },
    {
      id: 'm2',
      templateId: 'engage-customers',
      title: 'Engage Customers',
      reward: 30,
      priority: 70,
    },
  ];

  if (habit.streak >= 7) {
    missions.push({
      id: 'm3',
      templateId: 'streak-bonus',
      title: 'Maintain your streak',
      reward: 20,
      priority: 60,
    });
  }

  if (revenue.today > 0 || revenue.total > 0) {
    missions[0].title = 'Scale what worked yesterday';
    missions[0].reward = 60;
  }

  if (stage === 'PRO' || stage === 'MASTER') {
    missions.unshift({
      id: 'm-pro',
      templateId: 'pro-growth',
      title: 'Run advanced growth workflow',
      reward: 100,
      priority: 95,
    });
  }

  return missions;
}

export function createMissionScheduler({ journey, habit, revenueEngine } = {}) {
  return {
    generate(ctx) {
      if (!isGrowthEnabled()) return [];
      const j = journey?.get?.(ctx) || {};
      const habits = habit?.list?.(ctx) || [];
      const revenue = { today: 0, total: 0 };
      if (revenueEngine?.enabled) {
        revenue.today = revenueEngine.aiService?.getDailyTotal?.(ctx.userId) ?? 0;
      }
      return generateMission({ journey: j, habit: habits[0] || {}, revenue });
    },

    apply(ctx, missionEngine) {
      const templates = this.generate(ctx);
      const assigned = [];
      for (const t of templates) {
        const row = missionEngine.assign(ctx, {
          templateId: t.templateId || t.id,
          title: t.title,
          rewardPoints: t.reward,
          priority: t.priority,
        });
        assigned.push(row);
      }
      return assigned;
    },
  };
}
