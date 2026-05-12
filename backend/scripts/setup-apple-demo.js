/**
 * สร้าง Demo Accounts + Mock Deal สำหรับ Apple App Store Review
 * - Account 1: Employer (The Hirer)
 * - Account 2: Talent (The Service Provider)
 * - Mock Deal: งานที่ Talent สมัครแล้ว + Employer ส่ง Deal มาให้ (รอ Accept)
 *
 * Run: node scripts/setup-apple-demo.js (จาก backend หรือ docker backend)
 *
 * ⚠️ ก่อนรัน: ต้องเพิ่ม Test Phone Numbers ใน Firebase Console
 *    Authentication → Sign-in method → Phone → Phone numbers for testing
 *    - +66 81 234 5601 → Verification code: 123456
 *    - +66 81 234 5602 → Verification code: 123456
 */
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');
dotenv.config({ path: join(rootDir, '.env') });
dotenv.config({ path: join(__dirname, '..', '.env') });

// โหลด config: ลอง backend/scripts/ ก่อน แล้วค่อย dev-test-accounts/
const configPath = existsSync(join(__dirname, 'apple-demo-config.json'))
  ? join(__dirname, 'apple-demo-config.json')
  : join(rootDir, 'dev-test-accounts', 'apple-demo-config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));

// เมื่อรันจาก host: DB_HOST=db ต้องใช้ 127.0.0.1 (port forward)
// เมื่อรันจาก Docker: ใช้ DB_HOST ตามที่ compose ส่งมา (เช่น db)
const dbHost = process.env.USE_DB_HOST_AS_IS === '1'
  ? (process.env.DB_HOST || 'localhost')
  : (process.env.DB_HOST === 'db' ? '127.0.0.1' : (process.env.DB_HOST || 'localhost'));

const pool = new pg.Pool({
  host: dbHost,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_DATABASE || process.env.DB_NAME || 'meera_db',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD || 'meera123',
});

async function upsertUser(userConfig) {
  const hash = await bcrypt.hash(userConfig.password, 10);

  const existing = await pool.query(
    'SELECT id, phone, full_name, role, provider_status FROM users WHERE phone = $1 OR email = $2',
    [userConfig.phone, userConfig.email]
  );

  const walletBalance = userConfig.role === 'user' ? 50000 : 5000;

  if (existing.rows.length > 0) {
    const userId = existing.rows[0].id;
    const isTalent = userConfig.role === 'provider';
    await pool.query(
      `UPDATE users SET
        password_hash = $1,
        full_name = $2,
        email = $3,
        role = $4,
        kyc_level = $5,
        wallet_balance = COALESCE(wallet_balance, $6),
        provider_status = COALESCE($7, provider_status),
        firebase_uid = COALESCE($8, firebase_uid),
        provider_available = CASE WHEN $9 THEN TRUE ELSE provider_available END,
        expert_category = CASE WHEN $9 AND expert_category IS NULL THEN 'party_guest' ELSE expert_category END,
        account_status = COALESCE(account_status, 'active'),
        updated_at = NOW()
       WHERE id = $10`,
      [
        hash,
        userConfig.full_name,
        userConfig.email,
        userConfig.role,
        'level_2',
        walletBalance,
        userConfig.provider_status || null,
        userConfig.firebase_uid || null,
        isTalent,
        userId,
      ]
    );
    console.log('✅ Updated:', userConfig.role, '-', userConfig.phone, '(id:', userId, ')');
    return userId;
  } else {
    const userIdResult = await pool.query('SELECT gen_random_uuid() as id');
    const userId = userIdResult.rows[0].id;
    const isTalent = userConfig.role === 'provider';
    await pool.query(
      `INSERT INTO users (
        id, firebase_uid, email, phone, full_name, password_hash,
        role, provider_status, kyc_level, wallet_balance,
        provider_available, expert_category, account_status,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'level_2', $9, $10, $11, $12, NOW(), NOW())`,
      [
        userId,
        userConfig.firebase_uid || `apple-demo-${userConfig.role}`,
        userConfig.email,
        userConfig.phone,
        userConfig.full_name,
        hash,
        userConfig.role,
        userConfig.provider_status || 'UNVERIFIED',
        walletBalance,
        isTalent,
        isTalent ? 'party_guest' : null,
        'active',
      ]
    );
    console.log('✅ Created:', userConfig.role, '-', userConfig.phone, '(id:', userId, ')');
    return userId;
  }
}

/** สร้าง Match Jobs สำหรับ Demo Employer — ให้เห็นใน My Jobs (Posted + Hire tabs) */
async function setupMatchJobs(employerId, talentId) {
  const hasJobs = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs'`
  ).then((r) => r.rows?.length > 0);
  if (!hasJobs) {
    console.log('⏭️  jobs table not found — skipping Match Jobs');
    return null;
  }

  const jobId1 = `job_apple_demo_${Date.now()}_open`;
  const jobId2 = `job_apple_demo_${Date.now()}_hired`;

  // ลบ demo match jobs เก่า (จาก employer)
  await pool.query(
    `DELETE FROM jobs WHERE created_by = $1 AND (title = 'Demo Match Job (Apple Review)' OR title = 'Demo Hired Job (Apple Review)')`,
    [employerId]
  );

  try {
    const idCol = await pool.query(
      `SELECT data_type FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'id'`
    ).then((r) => r.rows?.[0]?.data_type || 'uuid');
    const useUuid = idCol === 'uuid';

    const locJson = JSON.stringify({ lat: 13.7462, lng: 100.5232 });
    const ins = async (cols, vals) => {
      await pool.query(`INSERT INTO jobs (${cols}) VALUES (${vals.map((_, i) => '$' + (i + 1)).join(',')})`, vals);
    };

    const baseCols = 'id, title, description, category, price, status, created_by, client_id, created_by_name, datetime, location, created_at, updated_at';
    const baseVals = (jobId, title, desc, cat, price, status, extra = {}) => {
      const d = new Date(Date.now() + (status === 'open' ? 7 : 3) * 864e5).toISOString();
      return [jobId, title, desc, cat, price, status, employerId, employerId, 'Demo Employer (Apple Review)', d, locJson, new Date(), new Date()];
    };
    const hiredCols = baseCols.replace('created_by_name, datetime', 'created_by_name, accepted_by, datetime');
    const hiredVals = (jobId, title, desc, cat, price) => {
      const b = baseVals(jobId, title, desc, cat, price, 'accepted');
      return [...b.slice(0, 9), talentId, ...b.slice(9)];
    };

    if (useUuid) {
      const u1 = (await pool.query('SELECT gen_random_uuid() as id')).rows[0].id;
      const u2 = (await pool.query('SELECT gen_random_uuid() as id')).rows[0].id;
      await ins(baseCols, baseVals(u1, 'Demo Match Job (Apple Review)', 'Sample job for App Store review. Match flow.', 'Delivery', 800, 'open'));
      await ins(hiredCols, hiredVals(u2, 'Demo Hired Job (Apple Review)', 'Job with Talent assigned. For testing Hire tab.', 'Cleaning', 1500));
    } else {
      await ins(baseCols, baseVals(jobId1, 'Demo Match Job (Apple Review)', 'Sample job for App Store review. Match flow.', 'Delivery', 800, 'open'));
      await ins(hiredCols, hiredVals(jobId2, 'Demo Hired Job (Apple Review)', 'Job with Talent assigned. For testing Hire tab.', 'Cleaning', 1500));
    }
    console.log('✅ Match Jobs created — Demo Employer will see jobs in My Jobs (Posted + Hire tabs)');
    return { openJobId: jobId1, hiredJobId: jobId2 };
  } catch (e) {
    console.warn('⚠️ Match Jobs insert failed:', e.message);
    return null;
  }
}

/** สร้าง Mock Deal สำหรับ Apple reviewer — งาน + สมัคร + แชท + Deal รอ Accept */
async function setupDemoDeal(employerId, talentId) {
  const jobConfig = config.demoJob || {
    title: 'Demo Job for App Store Review',
    description: 'Sample job for testing the Private Chat and Deal flow.',
    scope: 'Complete the demo task.',
    category: 'Design',
    min_budget: 1500,
    max_budget: 2500,
    duration_days: 3,
    deal_amount: 2000,
  };

  const hasAdvanceJobs = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = 'advance_jobs'`
  ).then((r) => r.rows?.length > 0);
  if (!hasAdvanceJobs) {
    console.log('⏭️  advance_jobs table not found — skipping Mock Deal (run migrations first)');
    return null;
  }

  const hasDeals = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = 'advance_job_deals'`
  ).then((r) => r.rows?.length > 0);
  if (!hasDeals) {
    console.log('⏭️  advance_job_deals table not found — skipping Mock Deal (run migration 092)');
    return null;
  }

  // ลบ demo job เก่าถ้ามี (จาก employer + title ตรง)
  await pool.query(
    `DELETE FROM advance_jobs WHERE employer_id = $1 AND title = $2`,
    [employerId, jobConfig.title]
  );

  const jobResult = await pool.query(
    `INSERT INTO advance_jobs (
      employer_id, title, description, scope, category,
      min_budget, max_budget, duration_days, status, is_platinum_priority,
      applicant_count, created_at, updated_at, published_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', false, 1, NOW(), NOW(), NOW())
    RETURNING id`,
    [
      employerId,
      jobConfig.title,
      jobConfig.description,
      jobConfig.scope,
      jobConfig.category,
      jobConfig.min_budget,
      jobConfig.max_budget,
      jobConfig.duration_days,
    ]
  );
  const jobId = jobResult.rows[0].id;

  await pool.query(
    `INSERT INTO advance_job_applicants (job_id, user_id, status) VALUES ($1, $2, 'interested')`,
    [jobId, talentId]
  );

  const hasThreads = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = 'advance_job_chat_threads'`
  ).then((r) => r.rows?.length > 0);
  if (hasThreads) {
    await pool.query(
      `INSERT INTO advance_job_chat_threads (job_id, employer_id, talent_id) VALUES ($1, $2, $3)
       ON CONFLICT (job_id, talent_id) DO NOTHING`,
      [jobId, employerId, talentId]
    );
  }

  await pool.query(
    `INSERT INTO advance_job_deals (job_id, employer_id, talent_id, amount, status)
     VALUES ($1, $2, $3, $4, 'pending')`,
    [jobId, employerId, talentId, jobConfig.deal_amount || jobConfig.max_budget]
  );

  console.log('✅ Mock Deal created — Job:', jobId, '| Deal ฿' + (jobConfig.deal_amount || jobConfig.max_budget), 'pending');
  return { jobId, dealAmount: jobConfig.deal_amount || jobConfig.max_budget };
}

async function main() {
  console.log('🍎 Setting up Apple Store Demo Accounts + Mock Deal...\n');

  const employerId = await upsertUser(config.employer);
  const talentId = await upsertUser(config.talent);

  const demoDeal = await setupDemoDeal(employerId, talentId);
  const matchJobs = await setupMatchJobs(employerId, talentId);

  console.log('\n📌 Demo Account Credentials (for App Store Connect → App Review Information):');
  console.log('─'.repeat(60));
  console.log('\nAccount 1 — Employer (The Hirer):');
  console.log('  Phone:    ', config.employer.phone);
  console.log('  Password: ', config.employer.password);
  console.log('  (Email for reference: ', config.employer.email, ')');
  console.log('\nAccount 2 — Talent (The Service Provider):');
  console.log('  Phone:    ', config.talent.phone);
  console.log('  Password: ', config.talent.password);
  console.log('  (Email for reference: ', config.talent.email, ')');
  console.log('\n⚠️  Firebase Test Phones required: Add +66812345601 and +66812345602');
  console.log('   with verification code 123456 in Firebase Console.');

  if (demoDeal) {
    console.log('\n📌 Review Mode / Demo Deal (Job Advance):');
    console.log('  As Talent (0812345602): My Applications → แชท → Accept Deal');
    console.log('  Job ID:', demoDeal.jobId);
  }
  if (matchJobs) {
    console.log('\n📌 My Jobs (Match flow):');
    console.log('  As Employer (0812345601): My Jobs → Posted tab + Hire tab');
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
