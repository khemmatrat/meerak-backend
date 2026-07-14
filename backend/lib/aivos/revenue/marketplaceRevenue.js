/**
 * Marketplace Revenue – tracks Gross Merchandise Value (GMV), take rate,
 * and net marketplace revenue across all product categories.
 */
export function createMarketplaceRevenue(deps = {}) {
  const { defaultTakeRate } = deps;
  const getTakeRate = defaultTakeRate || (() => parseFloat(process.env.AIVOS_REVENUE_TAKE_RATE || '0.20'));

  const orders = []; // { orderId, category, gmv, takeRate, netRevenue, ts }

  function recordOrder({ orderId, category = 'general', gmv, takeRate = null, ts = null }) {
    const rate = takeRate ?? getTakeRate();
    const netRevenue = gmv * rate;
    const entry = { orderId, category, gmv, takeRate: rate, netRevenue, ts: ts || new Date().toISOString() };
    orders.push(entry);
    return entry;
  }

  /**
   * Aggregate marketplace metrics.
   * @param {{ since?, category? }} filter
   */
  function metrics(filter = {}) {
    let data = orders;
    if (filter.since)    data = data.filter((o) => o.ts >= filter.since);
    if (filter.category) data = data.filter((o) => o.category === filter.category);

    const totalGmv        = data.reduce((s, o) => s + o.gmv, 0);
    const totalNetRevenue = data.reduce((s, o) => s + o.netRevenue, 0);
    const orderCount      = data.length;
    const avgOrderValue   = orderCount > 0 ? totalGmv / orderCount : 0;
    const avgTakeRate     = orderCount > 0 ? data.reduce((s, o) => s + o.takeRate, 0) / orderCount : 0;

    return { totalGmv, totalNetRevenue, orderCount, avgOrderValue, avgTakeRate };
  }

  function byCategory() {
    const cats = [...new Set(orders.map((o) => o.category))];
    return cats.map((c) => ({ category: c, ...metrics({ category: c }) }));
  }

  return { recordOrder, metrics, byCategory };
}

export default createMarketplaceRevenue;
