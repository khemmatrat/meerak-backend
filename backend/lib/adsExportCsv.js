/**
 * CSV export for campaign insights.
 */

function esc(v) {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function insightsToCsv(data) {
  const lines = [];
  lines.push('section,key,value');
  lines.push(`summary,campaignId,${esc(data.campaignId)}`);
  lines.push(`summary,range,${esc(data.range)}`);
  lines.push(`summary,impressions,${esc(data.periodImpressions ?? data.impressions)}`);
  lines.push(`summary,clicks,${esc(data.periodClicks ?? data.clicks)}`);
  lines.push(`summary,outcomes,${esc(data.periodOutcomes ?? data.conversions)}`);
  lines.push(`summary,ctr,${esc(data.periodCtr ?? data.ctr)}`);
  lines.push(`summary,cvr,${esc(data.periodCvr)}`);
  lines.push(`summary,spendMicro,${esc(data.spendMicro)}`);

  lines.push('');
  lines.push('daily,date,impressions,clicks,outcomes,spendMicro,escrowRemainingMicro,ctr,cvr');
  for (const d of data.dailySeries || []) {
    lines.push(
      [
        'daily',
        esc(d.date),
        esc(d.impressions),
        esc(d.clicks),
        esc(d.outcomes),
        esc(d.spendMicro ?? ''),
        esc(d.escrowRemainingMicro ?? ''),
        esc(d.ctr),
        esc(d.cvr),
      ].join(','),
    );
  }

  lines.push('');
  lines.push('surface,name,count');
  for (const [name, count] of Object.entries(data.surfaceBreakdown || {})) {
    lines.push(['surface', esc(name), esc(count)].join(','));
  }

  lines.push('');
  lines.push('geo,province,clicks');
  for (const g of data.geoBreakdown || []) {
    lines.push(['geo', esc(g.province), esc(g.clicks)].join(','));
  }

  if (data.cohortRetention) {
    lines.push('');
    lines.push('cohort,metric,value');
    lines.push(`cohort,retentionRatePct,${esc(data.cohortRetention.retentionRatePct)}`);
    lines.push(`cohort,repeatOutcomeUsers,${esc(data.cohortRetention.repeatOutcomeUsers)}`);
  }

  return `${lines.join('\n')}\n`;
}
