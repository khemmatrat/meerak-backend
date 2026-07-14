/**
 * ROAS Calculator – Return on Ad Spend.
 *
 * ROAS = Revenue from Ads / Ad Spend
 * Also calculates blended ROAS, target ROAS gap, and efficiency score.
 */
export function createRoasCalculator(deps = {}) {
  const entries = []; // { channel, campaign, adSpend, attributedRevenue, ts }

  function record({ channel, campaign = 'default', adSpend, attributedRevenue, ts = null }) {
    entries.push({ channel, campaign, adSpend, attributedRevenue, ts: ts || new Date().toISOString() });
  }

  /**
   * Calculate ROAS for a filter.
   * @param {{ channel?, campaign?, since? }} filter
   * @returns {{ roas, totalSpend, totalRevenue, efficiency }}
   */
  function calculate(filter = {}) {
    let data = entries;
    if (filter.channel)  data = data.filter((e) => e.channel  === filter.channel);
    if (filter.campaign) data = data.filter((e) => e.campaign === filter.campaign);
    if (filter.since)    data = data.filter((e) => e.ts >= filter.since);

    const totalSpend   = data.reduce((s, e) => s + e.adSpend, 0);
    const totalRevenue = data.reduce((s, e) => s + e.attributedRevenue, 0);
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : null;
    const efficiency = roas !== null ? Math.min(1, roas / 4) : 0; // 4x = 100% efficient
    return { roas, totalSpend, totalRevenue, efficiency };
  }

  /**
   * Compare ROAS to target and return gap analysis.
   * @param {number} targetRoas
   */
  function gapAnalysis(targetRoas = 4, filter = {}) {
    const { roas, totalSpend, totalRevenue } = calculate(filter);
    const gap = roas !== null ? roas - targetRoas : null;
    const requiredRevenue = totalSpend * targetRoas;
    return { roas, targetRoas, gap, requiredRevenue, totalRevenue, onTarget: gap !== null && gap >= 0 };
  }

  function byChannel() {
    const channels = [...new Set(entries.map((e) => e.channel))];
    return channels.map((ch) => ({ channel: ch, ...calculate({ channel: ch }) }));
  }

  return { record, calculate, gapAnalysis, byChannel };
}

export default createRoasCalculator;
