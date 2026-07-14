#!/usr/bin/env node
/**
 * Phase 13 runtime check — seed demo courses + route/table readiness.
 * Usage: node scripts/run-course-phase13-check.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildCourseMarketplaceReadiness, DEMO_COURSE_IDS } from '../lib/courseMarketplaceReadiness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_DATABASE || 'meera_db',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD || 'meera123',
});

async function main() {
  console.log('=== Course Marketplace Phase 13 Check ===\n');

  const readiness = await buildCourseMarketplaceReadiness(pool, {
    app: {
      get(key) {
        return [
          'courseMarketplaceRoutesRegistered',
          'courseStudioRoutesRegistered',
          'coursePurchaseRoutesRegistered',
          'courseGatewayRoutesRegistered',
        ].includes(key);
      },
    },
  });

  console.log('Hint:', readiness.hint);
  console.log('Published courses:', readiness.publishedCourses);
  console.log('Preview lessons:', readiness.previewLessons);
  console.log('Demo course IDs:', DEMO_COURSE_IDS);
  console.log('Demo courses:', JSON.stringify(readiness.demoCourses, null, 2));
  console.log('\nTables:', readiness.tables);
  console.log('\nDev restart checklist:');
  for (const line of readiness.devRestartChecklist || []) {
    console.log(`  • ${line}`);
  }

  const dbOk =
    readiness.publishedCourses >= 1
    && readiness.previewLessons >= 1
    && readiness.demoCourses?.[DEMO_COURSE_IDS.paid]?.lessonCount >= 1
    && readiness.demoCourses?.[DEMO_COURSE_IDS.free]?.previewCount >= 1;

  console.log('\nDB seed ready:', dbOk ? 'YES' : 'NO');
  console.log('Full readiness (needs live server for route flags):', readiness.ok ? 'YES' : 'NO');

  await pool.end();
  process.exit(dbOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
