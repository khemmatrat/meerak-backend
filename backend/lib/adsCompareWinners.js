/**
 * Annotate cross-campaign compare response with winner highlights.
 */
function metric(c, keys, fallback = 0) {
  for (const k of keys) {
    const parts = k.split('.');
    let v = c;
    for (const p of parts) {
      v = v?.[p];
    }
    if (v != null && v !== '') return Number(v);
  }
  return fallback;
}

function bestCampaigns(campaigns, scoreFn) {
  let max = -Infinity;
  const ids = [];
  for (const c of campaigns) {
    const v = scoreFn(c);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (v > max) {
      max = v;
      ids.length = 0;
      ids.push(c.campaignId || c.id);
    } else if (v === max) {
      ids.push(c.campaignId || c.id);
    }
  }
  if (!ids.length) return null;
  return { value: Math.round(max * 10000) / 10000, campaignIds: ids };
}

export function annotateCompareWinners(data) {
  const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : [];
  if (campaigns.length < 2) {
    return { ...data, campaigns, winners: null };
  }

  const winners = {
    ctr: bestCampaigns(campaigns, (c) => metric(c, ['periodCtr', 'ctr'])),
    cvr: bestCampaigns(campaigns, (c) => metric(c, ['periodCvr', 'funnel.clickToOutcomeRate'])),
    outcomes: bestCampaigns(campaigns, (c) => metric(c, ['periodOutcomes', 'conversions'])),
    impressions: bestCampaigns(campaigns, (c) => metric(c, ['periodImpressions', 'impressions'])),
    efficiency: bestCampaigns(campaigns, (c) => {
      const outcomes = metric(c, ['periodOutcomes', 'conversions']);
      const spendMicro = metric(c, ['spendMicro']);
      if (outcomes <= 0 || spendMicro <= 0) return 0;
      return outcomes / (spendMicro / 1_000_000);
    }),
  };

  const annotated = campaigns.map((c) => {
    const id = c.campaignId || c.id;
    const flags = {};
    for (const [key, win] of Object.entries(winners)) {
      if (win?.campaignIds?.includes(id)) flags[`winner_${key}`] = true;
    }
    return { ...c, compareFlags: flags };
  });

  return { ...data, campaigns: annotated, winners };
}
