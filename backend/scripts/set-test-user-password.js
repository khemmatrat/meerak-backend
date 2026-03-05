/**
 * ตั้งรหัสผ่านสำหรับผู้ใช้ทดสอบ (เบอร์โทร + รหัสผ่าน)
 * ใช้สำหรับ Login ผ่าน /api/auth/login
 *
 * Run: node backend/scripts/set-test-user-password.js <phone> <password>
 * ตัวอย่าง: node backend/scripts/set-test-user-password.js 0811111111 test123
 *
 * ถ้าเบอร์ยังไม่มีใน users จะสร้าง user ใหม่
 */
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');
dotenv.config({ path: join(rootDir, '.env') });

const phone = process.argv[2]?.trim();
const password = process.argv[3];

if (!phone || !password) {
  console.log('Usage: node backend/scripts/set-test-user-password.js <phone> <password>');
  console.log('Example: node backend/scripts/set-test-user-password.js 0811111111 test123');
  process.exit(1);
}

const pool = new pg.Pool({
  host: process.env.DB_HOST === 'db' ? '127.0.0.1' : (process.env.DB_HOST || 'localhost'),
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_DATABASE || 'meera_db',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD || 'meera123',
});

async function main() {
  const hash = await bcrypt.hash(password, 10);

  const existing = await pool.query(
    'SELECT id, phone, full_name FROM users WHERE phone = $1',
    [phone]
  );

  if (existing.rows.length > 0) {
    const userId = existing.rows[0].id;
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hash, userId]
    );
    console.log('✅ Password updated for', phone, '(user id:', userId, ')');
  } else {
    const userIdResult = await pool.query('SELECT gen_random_uuid() as id');
    const userId = userIdResult.rows[0].id;
    await pool.query(
      `INSERT INTO users (id, firebase_uid, email, phone, full_name, password_hash, role, kyc_level, wallet_balance, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'user', 'level_1', 0, NOW())`,
      [userId, `test-${phone}`, `${phone}@aqond.com`, phone, `Test User ${phone}`, hash]
    );
    console.log('✅ User created:', phone, '(user id:', userId, ')');
  }

  console.log('\n📌 Login with:');
  console.log('   Phone:', phone);
  console.log('   Password:', password);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
