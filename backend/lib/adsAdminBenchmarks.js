import { getAdCampaignInsightsV2, listAdCampaigns } from './adsBridgeClient.js';

const OBJECTIVES = ['TRAFFIC', 'VIDEO_VIEWS', 'STORY_VIEWS', 'MARKETPLACE_LEADS', 'PROFILE_VISITS'];

function median(sorted) {
  if (!sorted.length) return 0;
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Platform median CTR/CVR by objective (admin read-only).
 */
export async function getAdsAdminBenchmarks(range = '30d') {
  const { campaigns = [] } = await listAdCampaigns(80).catch(() => ({ campaigns: [] }));
  const byObjective = new Map();
  for (const c of campaigns) {
    const obj = c.objective || 'TRAFFIC';
    if (!byObjective.has(obj)) byObjective.set(obj, []);
    const list = byObjective.get(obj);
    if (list.length < 12) list.push(c.id);
  }

  const benchmarks = [];
  for (const objective of OBJECTIVES) {
    const ids = byObjective.get(objective) || [];
    if (!ids.length) {
      benchmarks.push({ objective, medianCtr: 0, medianCvr: 0, sampleSize: 0 });
      continue;
    }
    const stats = await Promise.all(
      ids.slice(0, 8).map((id) => getAdCampaignInsightsV2(id, range).catch(() => null)),
    );
    const valid = stats.filter(Boolean);
    const ctrs = valid
      .map((s) => Number(s.periodCtr ?? s.ctr ?? 0))
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    const cvrs = valid
      .map((s) => Number(s.periodCvr ?? 0))
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    benchmarks.push({
      objective,
      medianCtr: Math.round(median(ctrs) * 100) / 100,
      medianCvr: Math.round(median(cvrs) * 100) / 100,
      sampleSize: valid.length,
    });
  }

  return { range, benchmarks };
}
