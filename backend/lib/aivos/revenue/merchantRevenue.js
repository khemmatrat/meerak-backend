/**
 * Merchant Revenue – per-merchant sales reporting, payout calculation,
 * and performance ranking.
 */
export function createMerchantRevenue(deps = {}) {
  const commissionEngine = deps.commissionEngine || null;
  const merchants = new Map(); // merchantId -> { name, tier, sales: [] }

  function registerMerchant({ merchantId, name, tier = 'standard' }) {
    merchants.set(merchantId, { merchantId, name, tier, sales: [] });
  }

  function recordSale({ merchantId, orderId, gmv, ts = null }) {
    if (!merchants.has(merchantId)) registerMerchant({ merchantId, name: merchantId });
    const m = merchants.get(merchantId);
    let commission = null;
    if (commissionEngine) commission = commissionEngine.calculate({ transactionId: orderId, sellerId: merchantId, gmv });
    m.sales.push({ orderId, gmv, commission, ts: ts || new Date().toISOString() });
    return { merchantId, orderId, gmv, commission };
  }

  function report(merchantId) {
    const m = merchants.get(merchantId);
    if (!m) return null;
    const totalGmv  = m.sales.reduce((s, t) => s + t.gmv, 0);
    const totalPayouts = m.sales.reduce((s, t) => s + (t.commission?.payout || t.gmv), 0);
    return { merchantId, name: m.name, tier: m.tier, saleCount: m.sales.length, totalGmv, totalPayouts };
  }

  function rankMerchants() {
    return [...merchants.keys()].map((id) => report(id)).sort((a, b) => b.totalGmv - a.totalGmv);
  }

  return { registerMerchant, recordSale, report, rankMerchants };
}

export default createMerchantRevenue;
