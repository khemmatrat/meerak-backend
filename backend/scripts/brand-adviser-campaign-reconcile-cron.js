#!/usr/bin/env node
/**
 * Brand Adviser Grand Prize — reconcile referrer snapshot counters hourly.
 *   node backend/scripts/brand-adviser-campaign-reconcile-cron.js
 */
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { reconcileCampaignSnapshots } from '../lib/brandAdviserCampaign.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');
dotenv.config({ path: join(rootDir, '.env') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const { Pool } = pg;
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_DATABASE || 'meera_db',
    user: process.env.DB_USER || 'meera',
    password: process.env.DB_PASSWORD || 'meera123',
  });

async function main() {
  try {
    const out = await reconcileCampaignSnapshots(pool);
    console.log('[brand-adviser-campaign-reconcile]', JSON.stringify(out));
    process.exit(0);
  } catch (e) {
    console.error('[brand-adviser-campaign-reconcile] fatal:', e?.message || e);
    process.exit(1);
  } finally {
    await pool.end().catch(() => { });
  }
}

main();
