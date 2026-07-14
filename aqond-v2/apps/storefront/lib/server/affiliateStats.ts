import fs from 'fs/promises';
import path from 'path';
import { listAffiliateLinks } from './studioStore';

const STATS_FILE = path.join(process.cwd(), '.data', 'studio', 'affiliate-stats.json');

type LinkStats = { clicks: number; conversions: number; revenue_micro: number };
type StatsDb = Record<string, LinkStats>;

function key(creatorId: string, productId: string) {
  return `${creatorId}:${productId}`;
}

async function readStats(): Promise<StatsDb> {
  try {
    return JSON.parse(await fs.readFile(STATS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function writeStats(db: StatsDb) {
  await fs.mkdir(path.dirname(STATS_FILE), { recursive: true });
  await fs.writeFile(STATS_FILE, JSON.stringify(db, null, 2));
}

export async function recordAffiliateClick(creatorId: string, productId: string) {
  const db = await readStats();
  const k = key(creatorId, productId);
  const row = db[k] || { clicks: 0, conversions: 0, revenue_micro: 0 };
  row.clicks += 1;
  db[k] = row;
  await writeStats(db);
}

export async function recordAffiliateConversion(creatorId: string, productId: string, revenueMicro: number) {
  const db = await readStats();
  const k = key(creatorId, productId);
  const row = db[k] || { clicks: 0, conversions: 0, revenue_micro: 0 };
  row.conversions += 1;
  row.revenue_micro += revenueMicro;
  db[k] = row;
  await writeStats(db);
}

export async function getCreatorEarnings(creatorId: string) {
  const links = await listAffiliateLinks(creatorId);
  const stats = await readStats();
  const period = new Date().toISOString().slice(0, 7);

  let affiliateMicro = 0;
  let totalClicks = 0;
  let totalConversions = 0;

  const enriched = links.map((l) => {
    const s = stats[key(creatorId, l.product_id)] || { clicks: 0, conversions: 0, revenue_micro: 0 };
    const commissionMicro = Math.round((s.revenue_micro * l.commission_bps) / 10000);
    affiliateMicro += commissionMicro;
    totalClicks += s.clicks;
    totalConversions += s.conversions;
    return {
      id: l.id,
      product_id: l.product_id,
      title: l.title,
      short_code: l.id.slice(-8),
      clicks: s.clicks,
      conversions: s.conversions,
      commission_bps: l.commission_bps,
      estimated_micro: commissionMicro,
      synced_recsys: l.synced_recsys,
    };
  });

  return {
    creator_id: creatorId,
    period,
    revenue: {
      period,
      affiliate_micro: affiliateMicro,
      live_gifts_micro: 0,
      ads_micro: 0,
      subscription_micro: 0,
      payout_micro: Math.floor(affiliateMicro * 0.85),
    },
    analytics: { views: 0, new_followers: 0, comments: 0, revenue_micro: affiliateMicro },
    affiliate_links: enriched,
    totals: { clicks: totalClicks, conversions: totalConversions },
    source: 'local' as const,
  };
}
