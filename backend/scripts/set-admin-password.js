/**
 * Set or reset admin password for Nexus Admin Core.
 * Run from project root: node backend/scripts/set-admin-password.js [newPassword]
 * Or from backend: node scripts/set-admin-password.js [newPassword]
 * Default password if not provided: admin123
 *
 * Requires: DB_* in root .env, and migration 010 run (users.password_hash, user_roles).
 */
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');

dotenv.config({ path: join(rootDir, '.env') });

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@nexus.com').trim().toLowerCase();
const newPassword = process.argv[2] || 'admin123';

async function main() {
  const dbHost = process.env.DB_HOST === 'db' ? '127.0.0.1' : (process.env.DB_HOST || 'localhost');
  const pool = new pg.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_DATABASE || 'meera_db',
    user: process.env.DB_USER || 'meera',
    password: process.env.DB_PASSWORD || 'meera123',
  });

  try {
    const hash = await bcrypt.hash(newPassword, 10);
    let userId;

    const existing = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = $1',
      [ADMIN_EMAIL]
    );

    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
      await pool.query(
        'UPDATE users SET password_hash = $1, password = $2, updated_at = NOW() WHERE id = $3',
        [hash, newPassword, userId]
      );
      console.log('✅ Admin password updated for', ADMIN_EMAIL, '(user id:', userId, ')');
    } else {
      // ตรวจสอบว่ามี firebase_uid หรือไม่ (migration 001 กำหนด NOT NULL)
      const hasFirebaseUid = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'firebase_uid'`
      );
      const hasRoleCol = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'`
      );

      const firebaseUid = 'admin-nexus-com';
      let insertCols, insertVals, insertParams;

      if (hasFirebaseUid.rows.length > 0 && hasRoleCol.rows.length > 0) {
        insertCols = 'firebase_uid, email, full_name, password_hash, password, role, kyc_level, wallet_balance, created_at';
        insertVals = '$1, $2, $3, $4, $5, \'admin\', \'level_2\', 0, NOW()';
        insertParams = [firebaseUid, ADMIN_EMAIL, 'Nexus Admin', hash, newPassword];
      } else if (hasFirebaseUid.rows.length > 0) {
        insertCols = 'firebase_uid, email, full_name, password_hash, password, kyc_level, wallet_balance, created_at';
        insertVals = '$1, $2, $3, $4, $5, \'level_2\', 0, NOW()';
        insertParams = [firebaseUid, ADMIN_EMAIL, 'Nexus Admin', hash, newPassword];
      } else if (hasRoleCol.rows.length > 0) {
        insertCols = 'email, full_name, password_hash, password, role, kyc_level, wallet_balance, created_at';
        insertVals = '$1, $2, $3, $4, \'admin\', \'level_2\', 0, NOW()';
        insertParams = [ADMIN_EMAIL, 'Nexus Admin', hash, newPassword];
      } else {
        insertCols = 'email, full_name, password_hash, password, kyc_level, wallet_balance, created_at';
        insertVals = '$1, $2, $3, $4, \'level_2\', 0, NOW()';
        insertParams = [ADMIN_EMAIL, 'Nexus Admin', hash, newPassword];
      }

      const insertResult = await pool.query(
        `INSERT INTO users (${insertCols}) VALUES (${insertVals}) RETURNING id`,
        insertParams
      );
      userId = insertResult.rows[0].id;
      console.log('✅ Admin user created:', ADMIN_EMAIL, '(user id:', userId, ')');
    }

    await pool.query(
      `INSERT INTO user_roles (user_id, role, created_at, updated_at)
       VALUES ($1, 'ADMIN', NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET role = 'ADMIN', updated_at = NOW()`,
      [String(userId)]
    );
    console.log('✅ user_roles set to ADMIN');

    console.log('\n📌 Use these credentials in Nexus Admin Core:');
    console.log('   Email:', ADMIN_EMAIL);
    console.log('   Password:', newPassword);
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.message.includes('relation "user_roles" does not exist')) {
      console.error('   Run migration: node backend/scripts/run-migration.js 010');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
