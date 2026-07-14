#!/usr/bin/env node
/**
 * E2E verify: ad click attribution → booking confirmed → escrow −0.05 THB
 *
 * Usage:
 *   node backend/scripts/verify-ads-outcome-e2e.js
 *   node backend/scripts/verify-ads-outcome-e2e.js --campaign-id=<uuid> --booker-id=<uuid>
 *   node backend/scripts/verify-ads-outcome-e2e.js --dry-run
 *
 * Requires: DB_* or DATABASE_URL, SOCIAL_CORE_API_URL, ADS_SERVICE_API_KEY, active OUTCOME_ONLY escrow
 */
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isAdsBridgeConfigured } from '../lib/adsBridgeClient.js';
import { OUTCOME_COST_MICRO } from '../lib/adsCampaignBilling.js';
import {
  onBookingConfirmed,
  storeClickAttribution,
  setOutcomeAttributionDeps,
} from '../lib/adsOutcomeAttribution.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const OUTCOME_MICRO = BigInt(OUTCOME_COST_MICRO || '50000');
const OUTCOME_THB = Number(OUTCOME_MICRO) / 1_000_000;

function parseArgs(argv) {
  const out = { dryRun: false, campaignId: null, bookerId: null, talentId: null };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--campaign-id=')) out.campaignId = a.split('=')[1];
    else if (a.startsWith('--booker-id=')) out.bookerId = a.split('=')[1];
    else if (a.startsWith('--talent-id=')) out.talentId = a.split('=')[1];
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: node scripts/verify-ads-outcome-e2e.js [options]

Options:
  --campaign-id=<uuid>   Social Core campaign id (default: latest active OUTCOME_ONLY escrow)
  --booker-id=<uuid>     User who "clicked" and booked (must differ from advertiser)
  --talent-id=<uuid>     Optional talent for self-attribution guard
  --dry-run              Check prerequisites only, no billing
`);
      process.exit(0);
    }
  }
  return out;
}

function ok(msg) {
  console.log(`OK  ${msg}`);
}
function warn(msg) {
  console.warn(`WARN ${msg}`);
}
function fail(msg, code = 1) {
  console.error(`FAIL ${msg}`);
  process.exit(code);
}

async function pickCampaign(pool, campaignId) {
  if (campaignId) {
    const r = await pool.query(
      `SELECT * FROM ad_campaign_escrow
       WHERE social_campaign_id = $1::text AND status = 'active' AND billing_model = 'OUTCOME_ONLY'
       LIMIT 1`,
      [campaignId],
    );
    return r.rows[0] || null;
  }
  const r = await pool.query(
    `SELECT * FROM ad_campaign_escrow
     WHERE status = 'active' AND billing_model = 'OUTCOME_ONLY' AND social_campaign_id IS NOT NULL
       AND (escrow_micro::bigint - spent_micro::bigint) >= $1
     ORDER BY created_at DESC LIMIT 1`,
    [OUTCOME_MICRO.toString()],
  );
  return r.rows[0] || null;
}

async function pickBooker(pool, advertiserId, bookerId) {
  if (bookerId) {
    if (String(bookerId) === String(advertiserId)) {
      fail('booker-id must differ from campaign advertiser (escrow owner)');
    }
    return bookerId;
  }
  const r = await pool.query(
    `SELECT id FROM users WHERE id <> $1::uuid ORDER BY created_at DESC LIMIT 1`,
    [advertiserId],
  );
  return r.rows[0]?.id || null;
}

const args = parseArgs(process.argv.slice(2));

function buildPoolConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined,
    };
  }
  if (!process.env.DB_HOST && !process.env.DB_DATABASE) {
    return null;
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_DATABASE || 'meera_db',
    user: process.env.DB_USER || 'meera',
    password: process.env.DB_PASSWORD != null ? String(process.env.DB_PASSWORD) : '',
  };
}

const poolConfig = buildPoolConfig();
if (!poolConfig) {
  fail('Database not configured — set DB_HOST/DB_DATABASE or DATABASE_URL in backend/.env');
}

const pool = new pg.Pool(poolConfig);

setOutcomeAttributionDeps({ redis: null });

try {
  console.log('=== Ads outcome billing E2E ===\n');

  if (!isAdsBridgeConfigured()) {
    fail('Ads bridge not configured — set SOCIAL_CORE_API_URL + ADS_SERVICE_API_KEY');
  }
  ok(`Social Core bridge: ${process.env.SOCIAL_CORE_API_URL}`);

  const esc = await pickCampaign(pool, args.campaignId);
  if (!esc) {
    fail('No active OUTCOME_ONLY escrow with remaining budget — create a campaign first');
  }
  ok(`Campaign ${esc.social_campaign_id} · escrow ${esc.escrow_micro} micro · spent ${esc.spent_micro} micro`);

  const bookerId = await pickBooker(pool, esc.user_id, args.bookerId);
  if (!bookerId) {
    fail('Need a booker user id (different from advertiser) — pass --booker-id=');
  }
  ok(`Booker ${bookerId} · advertiser ${esc.user_id}`);

  const remainingBefore = BigInt(esc.escrow_micro) - BigInt(esc.spent_micro);
  if (remainingBefore < OUTCOME_MICRO) {
    fail(`Escrow remaining ${remainingBefore} micro < ${OUTCOME_MICRO} (0.05 THB)`);
  }
  ok(`Escrow remaining ${remainingBefore} micro (≥ ${OUTCOME_MICRO})`);

  if (args.dryRun) {
    console.log('\nDry-run complete — prerequisites OK');
    process.exit(0);
  }

  const bookingId = `e2e-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const publicClickId = `e2e-click-${crypto.randomUUID()}`;
  const publicImpressionId = `e2e-imp-${crypto.randomUUID()}`;
  const outcomeKey = `booking:${bookingId}`;

  const creativeRow = await pool.query(
    `SELECT creative_id FROM ad_campaign_creative_variants
     WHERE campaign_id = $1 AND variant_key = 'A' LIMIT 1`,
    [esc.social_campaign_id],
  ).catch(() => ({ rows: [] }));
  const creativeId = creativeRow.rows[0]?.creative_id || null;

  await storeClickAttribution(pool, {
    meerakUserId: bookerId,
    campaignId: esc.social_campaign_id,
    creativeId,
    publicImpressionId,
    publicClickId,
    surface: 'VIDEO_FEED',
    windowDays: 30,
  });
  ok(`Stored click attribution ${publicClickId.slice(0, 24)}…`);

  const spentBefore = BigInt(esc.spent_micro);
  const result = await onBookingConfirmed(pool, {
    bookingId,
    bookerId,
    talentId: args.talentId || bookerId,
  });

  console.log('\nAttribution result:', JSON.stringify(result, null, 2));

  if (!result.attributed || !result.billed) {
    fail(`Outcome not billed: ${result.reason || 'unknown'} (check SC logs / bridge)`);
  }

  const escAfter = await pool.query(`SELECT spent_micro, status FROM ad_campaign_escrow WHERE id = $1`, [esc.id]);
  const spentAfter = BigInt(escAfter.rows[0]?.spent_micro || 0);
  const delta = spentAfter - spentBefore;

  if (delta !== OUTCOME_MICRO) {
    fail(`Escrow spent delta ${delta} micro, expected ${OUTCOME_MICRO}`);
  }
  ok(`Escrow spent +${delta} micro (${OUTCOME_THB} THB)`);

  const logRow = await pool.query(
    `SELECT id, status, cost_micro FROM ad_outcome_billable_log WHERE outcome_key = $1 LIMIT 1`,
    [outcomeKey],
  );
  if (!logRow.rows[0]) {
    fail(`Missing ad_outcome_billable_log row for ${outcomeKey}`);
  }
  ok(`Outcome log ${logRow.rows[0].id} status=${logRow.rows[0].status} cost=${logRow.rows[0].cost_micro}`);

  const ledger = await pool.query(
    `SELECT id FROM payment_ledger_audit
     WHERE event_type = 'ad_outcome_billable' AND metadata->>'outcome_key' = $1
     ORDER BY created_at DESC LIMIT 1`,
    [outcomeKey],
  );
  if (ledger.rows[0]) {
    ok(`Ledger audit ${ledger.rows[0].id}`);
  } else {
    warn('payment_ledger_audit row not found by outcome_key (may use different metadata shape)');
  }

  console.log('\n=== PASS: click → booking → escrow −0.05 THB ===');
  console.log(`bookingId=${bookingId} campaign=${esc.social_campaign_id}`);
} catch (e) {
  fail(e?.message || String(e));
} finally {
  await pool.end();
}
