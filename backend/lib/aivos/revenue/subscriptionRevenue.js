/**
 * Subscription Revenue – tracks MRR, ARR, churn, and expansion revenue.
 *
 * Subscriber lifecycle: new → active → churned | upgraded | downgraded
 */
export function createSubscriptionRevenue(deps = {}) {
  const subscribers = new Map(); // subId -> { plan, mrr, status, startedAt, history }

  function subscribe({ subId, plan, mrr, ts = null }) {
    subscribers.set(subId, {
      subId, plan, mrr, status: 'active',
      startedAt: ts || new Date().toISOString(),
      history: [{ event: 'subscribed', plan, mrr, ts: ts || new Date().toISOString() }],
    });
  }

  function churn(subId, ts = null) {
    const s = subscribers.get(subId);
    if (!s) return;
    s.status = 'churned';
    s.churnedAt = ts || new Date().toISOString();
    s.history.push({ event: 'churned', ts: s.churnedAt });
  }

  function upgrade({ subId, newPlan, newMrr, ts = null }) {
    const s = subscribers.get(subId);
    if (!s) return;
    s.plan = newPlan; s.mrr = newMrr;
    s.history.push({ event: 'upgraded', newPlan, newMrr, ts: ts || new Date().toISOString() });
  }

  /**
   * Calculate MRR, ARR, churn rate, and net revenue retention.
   */
  function metrics() {
    const active  = [...subscribers.values()].filter((s) => s.status === 'active');
    const churned = [...subscribers.values()].filter((s) => s.status === 'churned');
    const mrr = active.reduce((s, sub) => s + sub.mrr, 0);
    const arr = mrr * 12;
    const churnRate = subscribers.size > 0 ? churned.length / subscribers.size : 0;
    const nrr = subscribers.size > 0 ? mrr / Math.max(1, (mrr + churned.reduce((s, c) => s + (c.mrr || 0), 0))) : 0;
    return { mrr, arr, activeSubscribers: active.length, churnedSubscribers: churned.length, churnRate, nrr };
  }

  function get(subId) { return subscribers.get(subId) || null; }
  function all()      { return [...subscribers.values()]; }

  return { subscribe, churn, upgrade, metrics, get, all };
}

export default createSubscriptionRevenue;
