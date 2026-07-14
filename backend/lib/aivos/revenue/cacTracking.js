/**
 * CAC Tracking – tracks Customer Acquisition Cost per channel and campaign.
 *
 * CAC = Total Marketing Spend / New Customers Acquired
 */
export function createCacTracking(deps = {}) {
  const spends    = []; // { channel, campaign, amount, ts }
  const acquiredCustomers = []; // { channel, campaign, customerId, ts }

  /** Record marketing spend. */
  function recordSpend({ channel, campaign = 'default', amount, ts = null }) {
    spends.push({ channel, campaign, amount, ts: ts || new Date().toISOString() });
  }

  /** Record a newly acquired customer. */
  function recordAcquisition({ channel, campaign = 'default', customerId, ts = null }) {
    acquiredCustomers.push({ channel, campaign, customerId, ts: ts || new Date().toISOString() });
  }

  /**
   * Calculate CAC overall or per channel/campaign.
   * @param {{ channel?, campaign? }} filter
   * @returns {{ cac, totalSpend, newCustomers }}
   */
  function calculate(filter = {}) {
    const filterFn = (d) =>
      (!filter.channel  || d.channel  === filter.channel)  &&
      (!filter.campaign || d.campaign === filter.campaign);

    const totalSpend    = spends.filter(filterFn).reduce((s, d) => s + d.amount, 0);
    const newCustomers  = acquiredCustomers.filter(filterFn).length;
    const cac = newCustomers > 0 ? totalSpend / newCustomers : null;
    return { cac, totalSpend, newCustomers };
  }

  /** CAC breakdown by channel. */
  function byChannel() {
    const channels = [...new Set(spends.map((s) => s.channel))];
    return channels.map((ch) => ({ channel: ch, ...calculate({ channel: ch }) }));
  }

  return { recordSpend, recordAcquisition, calculate, byChannel };
}

export default createCacTracking;
