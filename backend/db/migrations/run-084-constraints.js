/**
 * Run 084 constraint updates only (if migration split broke DO blocks)
 * Usage: node backend/db/migrations/run-084-constraints.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const client = new pg.Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_DATABASE || 'meera_db',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD || 'meera123',
});

async function run() {
  await client.connect();
  try {
    await client.query(`
      ALTER TABLE payment_ledger_audit DROP CONSTRAINT IF EXISTS payment_ledger_audit_event_type_check;
      ALTER TABLE payment_ledger_audit ADD CONSTRAINT payment_ledger_audit_event_type_check
        CHECK (event_type IN (
          'payment_created', 'payment_completed', 'payment_failed',
          'payment_expired', 'payment_refunded', 'escrow_held', 'escrow_released', 'escrow_refunded',
          'insurance_liability_credit', 'insurance_withdrawal',
          'booking_refund', 'booking_fee', 'talent_booking_payout',
          'vip_subscription', 'post_job_fee', 'branding_package_payout',
          'user_payout_withdrawal', 'wallet_deposit', 'wallet_tip',
          'coach_training_fee', 'trainee_net_income', 'certified_statement_fee',
          'no_show_refund', 'no_show_fine',
          'referral_bonus', 'referral_budget_exhausted',
          'withdrawal_fee_income',
          'admin_credit', 'admin_debit'
        ));
    `);
    console.log('✅ event_type constraint updated');
  } catch (e) {
    console.warn('event_type:', e.message);
  }
  try {
    await client.query(`
      ALTER TABLE payment_ledger_audit DROP CONSTRAINT IF EXISTS payment_ledger_audit_gateway_check;
      ALTER TABLE payment_ledger_audit ADD CONSTRAINT payment_ledger_audit_gateway_check
        CHECK (gateway IN ('promptpay', 'stripe', 'truemoney', 'wallet', 'bank_transfer', 'admin'));
    `);
    console.log('✅ gateway constraint updated');
  } catch (e) {
    console.warn('gateway:', e.message);
  }
  await client.end();
  console.log('Done');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
