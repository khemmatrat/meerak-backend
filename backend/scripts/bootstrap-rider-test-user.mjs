/**
 * Bootstrap rider + credit line for wallet topup E2E test.
 * Usage: node scripts/bootstrap-rider-test-user.mjs [USER_UUID]
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const USER_ID = process.argv[2] || process.env.USER_ID || 'dc8bcd17-ac18-4dfa-a1b0-97c568ed7c21';
const RIDER_ID = `rider-test-${USER_ID.slice(0, 8)}`;

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || 'meera_db',
  port: Number(process.env.DB_PORT || 5432),
});

const sql = readFileSync(join(__dirname, '..', 'db', 'migrations', '262_rider_os_commerce_bootstrap.sql'), 'utf8');
await pool.query(sql);

const user = await pool.query(
  `SELECT id, email, phone, wallet_balance FROM users WHERE id = $1::uuid`,
  [USER_ID],
);
if (!user.rows[0]) throw new Error(`User not found: ${USER_ID}`);

await pool.query(
  `INSERT INTO commerce.dispatch_riders
    (id, display_name, phone, vehicle, plate, user_id, kyc_status, bank_account, active)
   VALUES ($1, $2, $3, 'motorcycle', 'TEST-1', $4, 'approved', '1234567890', TRUE)
   ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, kyc_status = 'approved', active = TRUE`,
  [RIDER_ID, 'Wallet Test Rider', user.rows[0].phone || '0812345678', USER_ID],
);

await pool.query(
  `INSERT INTO commerce.rider_credit_accounts (rider_id, user_id, credit_limit_micro, credit_used_micro)
   VALUES ($1, $2, 50000, 0)
   ON CONFLICT (rider_id) DO NOTHING`,
  [RIDER_ID, USER_ID],
);

console.log('Bootstrapped rider for wallet topup test:');
console.log(JSON.stringify({
  user_id: USER_ID,
  email: user.rows[0].email,
  wallet_balance: user.rows[0].wallet_balance,
  rider_id: RIDER_ID,
}, null, 2));

await pool.end();
