export function createCampaignPlanner({ mission, notification } = {}) {
  return {
    plan(ctx, { goal, steps = [] } = {}) {
      const planned = steps.length ? steps : [
        { day: 1, action: 'publish_content' },
        { day: 2, action: 'engage_customers' },
        { day: 3, action: 'review_metrics' },
      ];
      const missions = planned.map((step, i) => mission?.assign?.(ctx, {
        templateId: `campaign-${i}`,
        title: step.action.replace(/_/g, ' '),
        rewardPoints: 20 + i * 5,
        priority: 60,
      }));
      notification?.push?.(ctx, {
        type: 'campaign.planned',
        priority: 70,
        payload: { goal: goal || 'growth', steps: planned.length },
      });
      return { ok: true, goal: goal || 'growth', steps: planned, missions };
    },
  };
}
