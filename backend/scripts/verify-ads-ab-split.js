#!/usr/bin/env node
/**
 * Verify A/B creative split for a campaign (local/dev).
 * Usage: node backend/scripts/verify-ads-ab-split.js <campaignId> [simulations=50]
 */
import pg from 'pg';
import { pickAbCreativeId, listCampaignVariants } from '../lib/adsCreativeVariants.js';

const campaignId = process.argv[2];
const n = Math.min(Math.max(parseInt(process.argv[3], 10) || 50, 1), 500);

if (!campaignId) {
  console.error('Usage: node backend/scripts/verify-ads-ab-split.js <campaignId> [simulations]');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined,
});

try {
  const variants = await listCampaignVariants(pool, campaignId);
  console.log('Variants:', variants.map((v) => `${v.variant_key}:${v.creative_id} imp=${v.impressions}`).join(', ') || 'none');

  if (variants.length < 2) {
    console.warn('WARN: fewer than 2 variants — register variant B first (mobile optimize tab or POST /api/ads/campaigns/:id/variants)');
  }

  const defaultCreativeId = variants.find((v) => v.variant_key === 'A')?.creative_id || variants[0]?.creative_id;
  const counts = {};
  for (let i = 0; i < n; i += 1) {
    const pick = await pickAbCreativeId(pool, campaignId, defaultCreativeId);
    const key = pick.variantKey || 'A';
    counts[key] = (counts[key] || 0) + 1;
  }

  console.log(`Simulated ${n} picks:`, counts);
  const keys = Object.keys(counts);
  if (keys.length >= 2) {
    const ratio = Math.min(...keys.map((k) => counts[k])) / Math.max(...keys.map((k) => counts[k]));
    console.log(ratio >= 0.25 ? 'OK split looks balanced (explore/exploit)' : 'WARN distribution skewed — check impressions counters');
  }
} catch (e) {
  console.error('FAIL', e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
