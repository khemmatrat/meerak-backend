/**
 * Merchant Top 10 weekly ranking + optional aqond-brain promo batch hooks
 */

import { randomUUID } from 'node:crypto';

const FALLBACK_MERCHANTS = [
  { shop_id: 'shop-glow-beauty', merchant_name: 'Glow Beauty TH', score: 9840 },
  { shop_id: 'shop-snack-box', merchant_name: 'Snack Box สด', score: 9210 },
  { shop_id: 'shop-home-living', merchant_name: 'Home Living 168', score: 8870 },
  { shop_id: 'shop-tech-deal', merchant_name: 'Tech Deal ไทย', score: 8520 },
  { shop_id: 'shop-organic-farm', merchant_name: 'Organic Farm สด', score: 8310 },
  { shop_id: 'shop-pet-paradise', merchant_name: 'Pet Paradise', score: 7980 },
  { shop_id: 'shop-fashion-hub', merchant_name: 'Fashion Hub BKK', score: 7650 },
  { shop_id: 'shop-coffee-roast', merchant_name: 'Coffee Roast Lab', score: 7420 },
  { shop_id: 'shop-kids-world', merchant_name: 'Kids World Shop', score: 7190 },
  { shop_id: 'shop-sport-pro', merchant_name: 'Sport Pro Store', score: 6950 },
];

function weekStartMonday(d = new Date()) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x.toISOString().slice(0, 10);
}

async function tableExists(pool, name) {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1`,
    [name],
  );
  return r.rows.length > 0;
}

async function aggregateRankings(pool) {
  const candidates = [];

  if (await tableExists(pool, 'user_intent_events')) {
    const intent = await pool.query(
      `SELECT entity_id AS shop_id,
              SUM(dwell_ms)::numeric AS score,
              COUNT(*)::int AS hits
       FROM user_intent_events
       WHERE logged_at > NOW() - INTERVAL '7 days'
         AND entity_type IN ('shop', 'product', 'shop_item', 'merchant')
       GROUP BY entity_id
       ORDER BY score DESC NULLS LAST
       LIMIT 20`,
    );
    for (const row of intent.rows) {
      candidates.push({
        shop_id: String(row.shop_id),
        merchant_name: `ร้าน ${String(row.shop_id).slice(0, 8)}`,
        score: Number(row.score || 0) + Number(row.hits || 0) * 100,
      });
    }
  }

  if (candidates.length < 10 && (await tableExists(pool, 'ads_warehouse_events'))) {
    const ads = await pool.query(
      `SELECT COALESCE(metadata->>'merchant_id', metadata->>'shop_id', merchant_id::text) AS shop_id,
              COUNT(*)::int * 500 AS score
       FROM ads_warehouse_events
       WHERE created_at > NOW() - INTERVAL '7 days'
         AND COALESCE(metadata->>'merchant_id', metadata->>'shop_id', merchant_id::text) IS NOT NULL
       GROUP BY 1
       ORDER BY score DESC
       LIMIT 15`,
    ).catch(() => ({ rows: [] }));
    for (const row of ads.rows) {
      if (!row.shop_id) continue;
      candidates.push({
        shop_id: String(row.shop_id),
        merchant_name: `ร้านโฆษณา ${String(row.shop_id).slice(0, 6)}`,
        score: Number(row.score || 0),
      });
    }
  }

  const merged = new Map();
  for (const c of [...candidates, ...FALLBACK_MERCHANTS]) {
    const prev = merged.get(c.shop_id);
    if (!prev || c.score > prev.score) merged.set(c.shop_id, c);
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((m, i) => ({ ...m, rank: i + 1 }));
}

async function queuePromoBatchForTop10(pool, weekStart, rows) {
  const AI_CORE = (process.env.AI_CORE_URL || 'http://127.0.0.1:8100').replace(/\/$/, '');
  const key = process.env.AI_CORE_API_KEY || '';
  let queued = 0;

  for (const row of rows) {
    const promoJobId = randomUUID();
    await pool.query(
      `UPDATE merchant_top10_snapshots SET promo_job_id = $3
       WHERE week_start = $1 AND rank = $2`,
      [weekStart, row.rank, promoJobId],
    );

    if (process.env.MERCHANT_TOP10_PROMO_BATCH === '1') {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (key) headers['x-ai-core-api-key'] = key;
        await fetch(`${AI_CORE}/v1/jarvis/concierge`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            task: 'merchant_weekly_promo',
            shop_id: row.shop_id,
            merchant_name: row.merchant_name,
            rank: row.rank,
            week_start: weekStart,
          }),
          signal: AbortSignal.timeout(8000),
        });
        queued++;
      } catch {
        /* batch promo is best-effort */
      }
    }
  }
  return queued;
}

export async function refreshMerchantTop10Snapshot(pool, { force } = {}) {
  const weekStart = weekStartMonday();

  if (!force) {
    const existing = await pool.query(
      `SELECT COUNT(*)::int AS c FROM merchant_top10_snapshots WHERE week_start = $1`,
      [weekStart],
    );
    if ((existing.rows[0]?.c || 0) >= 10) {
      return { weekStart, skipped: true, count: existing.rows[0].c };
    }
  }

  await pool.query(`DELETE FROM merchant_top10_snapshots WHERE week_start = $1`, [weekStart]);
  const rankings = await aggregateRankings(pool);

  for (const row of rankings) {
    await pool.query(
      `INSERT INTO merchant_top10_snapshots (week_start, rank, shop_id, merchant_name, score)
       VALUES ($1, $2, $3, $4, $5)`,
      [weekStart, row.rank, row.shop_id, row.merchant_name, row.score],
    );
  }

  const promoQueued = await queuePromoBatchForTop10(pool, weekStart, rankings);
  return { weekStart, count: rankings.length, promoQueued, merchants: rankings };
}

export async function getMerchantTop10(pool, weekStart) {
  const ws = weekStart || weekStartMonday();
  let rows = await pool.query(
    `SELECT rank, shop_id, merchant_name, score, promo_job_id, week_start, created_at
     FROM merchant_top10_snapshots
     WHERE week_start = $1
     ORDER BY rank ASC`,
    [ws],
  );

  if (rows.rows.length === 0) {
    await refreshMerchantTop10Snapshot(pool, { force: true });
    rows = await pool.query(
      `SELECT rank, shop_id, merchant_name, score, promo_job_id, week_start, created_at
       FROM merchant_top10_snapshots
       WHERE week_start = $1
       ORDER BY rank ASC`,
      [ws],
    );
  }

  return {
    weekStart: ws,
    merchants: rows.rows.map((r) => ({
      rank: r.rank,
      shopId: r.shop_id,
      merchantName: r.merchant_name,
      score: Number(r.score),
      promoJobId: r.promo_job_id,
      href: `/m/shop/${encodeURIComponent(r.shop_id)}`,
    })),
  };
}

/** Hourly cron — refresh once per ISO week if snapshot incomplete */
export async function runMerchantTop10WeeklyCron(pool) {
  const weekStart = weekStartMonday();
  const existing = await pool.query(
    `SELECT COUNT(*)::int AS c FROM merchant_top10_snapshots WHERE week_start = $1`,
    [weekStart],
  );
  if ((existing.rows[0]?.c || 0) >= 10) return { skipped: true, weekStart };

  const result = await refreshMerchantTop10Snapshot(pool, { force: false });
  if (!result.skipped) {
    console.log(
      `✅ [Cron] Merchant Top10 refreshed for ${result.weekStart} (${result.count} shops, promo batch ${result.promoQueued || 0})`,
    );
  }
  return result;
}
