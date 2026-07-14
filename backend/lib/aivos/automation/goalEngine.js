/**
 * Goal Engine – tracks high-level automation goals (e.g. "publish 5 videos/week")
 * and reports progress towards them, triggering completion or alert events.
 */
export function createGoalEngine(deps = {}) {
  const goals = new Map();
  const progress = new Map(); // goalId -> { current, history }

  /**
   * Define a goal.
   * @param {{ id, name, metric, target, window?: 'day'|'week'|'month', onComplete?, onAlert? }} goal
   */
  function define(goal) {
    goals.set(goal.id, { window: 'week', ...goal });
    if (!progress.has(goal.id)) progress.set(goal.id, { current: 0, history: [] });
  }

  /**
   * Record progress toward a goal.
   * @param {string} goalId
   * @param {number} delta
   * @returns {{ goalId, current, target, pct, status }}
   */
  function record(goalId, delta = 1) {
    if (!goals.has(goalId)) throw new Error(`goal_not_found:${goalId}`);
    const p = progress.get(goalId);
    p.current += delta;
    p.history.push({ delta, ts: new Date().toISOString() });
    const goal = goals.get(goalId);
    const pct = goal.target > 0 ? Math.min(1, p.current / goal.target) : 0;
    const status = pct >= 1 ? 'complete' : pct >= 0.8 ? 'near' : 'in_progress';
    if (status === 'complete' && typeof goal.onComplete === 'function') goal.onComplete({ goalId, current: p.current });
    return { goalId, current: p.current, target: goal.target, pct, status };
  }

  function get(goalId) {
    const goal = goals.get(goalId);
    const p = progress.get(goalId) || { current: 0 };
    if (!goal) return null;
    const pct = goal.target > 0 ? Math.min(1, p.current / goal.target) : 0;
    const status = pct >= 1 ? 'complete' : pct >= 0.8 ? 'near' : 'in_progress';
    return { ...goal, current: p.current, pct, status };
  }

  function reset(goalId) {
    const p = progress.get(goalId);
    if (p) { p.current = 0; p.history = []; }
  }

  function list() { return [...goals.values()].map((g) => get(g.id)); }

  return { define, record, get, reset, list };
}

export default createGoalEngine;
