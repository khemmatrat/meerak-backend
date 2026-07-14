/**
 * Commission Engine – calculates platform commissions and payouts
 * for marketplace sellers, instructors, and AI service partners.
 */
export function createCommissionEngine(deps = {}) {
  const { defaultTakeRate } = deps;
  const getTakeRate = defaultTakeRate || (() => parseFloat(process.env.AIVOS_REVENUE_TAKE_RATE || '0.20'));

  const transactions = []; // { transactionId, sellerId, gmv, takeRate, commission, payout, ts }
  const rateOverrides = new Map(); // sellerId -> takeRate

  /** Set a custom take rate for a seller. */
  function setRate(sellerId, rate) { rateOverrides.set(sellerId, rate); }

  /**
   * Calculate commission for a transaction.
   * @param {{ transactionId, sellerId, gmv, rateOverride? }} params
   */
  function calculate({ transactionId, sellerId, gmv, rateOverride = null }) {
    const rate = rateOverride ?? rateOverrides.get(sellerId) ?? getTakeRate();
    const commission = gmv * rate;
    const payout = gmv - commission;
    const entry = { transactionId, sellerId, gmv, takeRate: rate, commission, payout, ts: new Date().toISOString() };
    transactions.push(entry);
    return entry;
  }

  /** Summarise commissions for a seller. */
  function summary(sellerId) {
    const rows = transactions.filter((t) => t.sellerId === sellerId);
    const totalGmv    = rows.reduce((s, t) => s + t.gmv, 0);
    const totalComm   = rows.reduce((s, t) => s + t.commission, 0);
    const totalPayout = rows.reduce((s, t) => s + t.payout, 0);
    return { sellerId, transactionCount: rows.length, totalGmv, totalCommission: totalComm, totalPayout };
  }

  function platformTotal() {
    return transactions.reduce((s, t) => s + t.commission, 0);
  }

  function all() { return [...transactions]; }

  return { setRate, calculate, summary, platformTotal, all };
}

export default createCommissionEngine;
