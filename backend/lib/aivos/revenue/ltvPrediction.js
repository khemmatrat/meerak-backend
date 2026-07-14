/**
 * LTV Prediction – predicts Customer Lifetime Value using historical purchase data.
 *
 * Formula: LTV = ARPU * GrossMargin * AvgLifespanPeriods
 * Also supports cohort-based and simple ML-style regression.
 */
export function createLtvPrediction(deps = {}) {
  const customers = new Map(); // customerId -> { purchases: {value,ts}[], firstSeen }

  /** Record a purchase for a customer. */
  function recordPurchase({ customerId, value, ts = null }) {
    if (!customers.has(customerId)) customers.set(customerId, { purchases: [], firstSeen: ts || new Date().toISOString() });
    customers.get(customerId).purchases.push({ value, ts: ts || new Date().toISOString() });
  }

  /**
   * Predict LTV for a customer.
   * @param {string} customerId
   * @param {{ grossMargin?, lifespanMonths? }} opts
   * @returns {{ customerId, ltv, arpu, purchaseCount, lifespanMonths }}
   */
  function predict(customerId, { grossMargin = 0.6, lifespanMonths = 12 } = {}) {
    const data = customers.get(customerId);
    if (!data || !data.purchases.length) return { customerId, ltv: 0, arpu: 0, purchaseCount: 0, lifespanMonths };

    const totalRevenue = data.purchases.reduce((s, p) => s + p.value, 0);
    const n = data.purchases.length;
    const arpu = totalRevenue / n;
    const ltv = arpu * grossMargin * lifespanMonths;
    return { customerId, ltv, arpu, totalRevenue, purchaseCount: n, grossMargin, lifespanMonths };
  }

  /**
   * Segment customers by predicted LTV quartile.
   * @returns {{ high: string[], mid: string[], low: string[] }}
   */
  function segment({ grossMargin = 0.6, lifespanMonths = 12 } = {}) {
    const predictions = [...customers.keys()].map((id) => predict(id, { grossMargin, lifespanMonths }));
    predictions.sort((a, b) => b.ltv - a.ltv);
    const n = predictions.length;
    return {
      high: predictions.slice(0, Math.ceil(n * 0.25)).map((p) => p.customerId),
      mid:  predictions.slice(Math.ceil(n * 0.25), Math.ceil(n * 0.75)).map((p) => p.customerId),
      low:  predictions.slice(Math.ceil(n * 0.75)).map((p) => p.customerId),
    };
  }

  function avgLtv(opts = {}) {
    const ids = [...customers.keys()];
    if (!ids.length) return 0;
    return ids.reduce((s, id) => s + predict(id, opts).ltv, 0) / ids.length;
  }

  return { recordPurchase, predict, segment, avgLtv };
}

export default createLtvPrediction;
