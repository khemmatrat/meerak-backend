import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: './backend/.env' });

const { Pool } = pg;
const execute = process.argv.includes('--execute');
const allowDevSeed = process.argv.includes('--allow-dev-seed');
const rawSeedKey = process.argv.find((arg) => arg.startsWith('--seed-key='))?.split('=')[1] || 'LOCAL';
const seedKey = rawSeedKey.startsWith('DEBUG-TAX-SEED-') ? rawSeedKey : `DEBUG-TAX-SEED-${rawSeedKey}`;
const seedActor = 'DEBUG-TAX-SEED-SCRIPT';

const poolConfig = process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_DATABASE || 'meera_db',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD || '',
};
const pool = new Pool(poolConfig);

const sellerSnapshot = {
  legal_name: 'AQOND Technology Co., Ltd.',
  tax_id: '0105567000000',
  registered_address: 'Bangkok, Thailand',
  branch_code: '00000',
  branch_name: 'สำนักงานใหญ่',
  vat_registered: true,
  vat_rate_percent: 7,
  wht_rate_percent: 3,
};

const providerSnapshot = {
  legal_name: 'Dev Audit Provider',
  tax_id: '1101700000000',
  tax_entity_type: 'individual',
  registered_address: 'Bangkok, Thailand',
  branch_code: null,
  country: 'TH',
};

const customerSnapshot = {
  legal_name: 'Dev Audit Customer Co., Ltd.',
  tax_id: '0105567111111',
  tax_entity_type: 'company',
  registered_address: 'Bangkok, Thailand',
  branch_code: '00000',
  country: 'TH',
};

function getDbIdentity() {
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      return {
        host: url.hostname,
        database: url.pathname.replace(/^\//, ''),
        connection: `${url.hostname}/${url.pathname.replace(/^\//, '')}`,
      };
    } catch (_) {
      return { host: '', database: '', connection: 'DATABASE_URL' };
    }
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_DATABASE || 'meera_db',
    connection: `${process.env.DB_HOST || 'localhost'}/${process.env.DB_DATABASE || 'meera_db'}`,
  };
}

function isLocalOrDevDb() {
  const { host, database } = getDbIdentity();
  const hostText = String(host || '').toLowerCase();
  const dbText = String(database || '').toLowerCase();
  return ['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(hostText)
    || dbText.includes('dev')
    || dbText.includes('test')
    || dbText === 'meera_db';
}

function assertDevSeedAllowed() {
  if (isLocalOrDevDb() || allowDevSeed) return;
  const db = getDbIdentity();
  throw new Error(`Refusing to run dev tax seed against ${db.connection}. Use a local/dev DB or pass --allow-dev-seed intentionally.`);
}

async function getCounts(client) {
  const [{ rows: wht }, { rows: withdrawal }, { rows: wallet }] = await Promise.all([
    client.query(`SELECT COUNT(*)::int AS count FROM tax_withholding_postings`),
    client.query(`SELECT COUNT(*)::int AS count FROM fiscal_documents WHERE source_event_type = 'user_payout_withdrawal'`),
    client.query(`SELECT COALESCE(SUM(wallet_balance),0)::numeric AS wallet_balance, COALESCE(SUM(wallet_pending),0)::numeric AS wallet_pending FROM users`),
  ]);
  return {
    wht_postings: wht[0]?.count || 0,
    withdrawal_documents: withdrawal[0]?.count || 0,
    wht_ledger_rows: Number((await client.query(`SELECT COUNT(*)::int AS count FROM payment_ledger_audit WHERE event_type = 'provider_wht_withheld'`)).rows[0]?.count || 0),
    wallet_balance_sum: Number(wallet[0]?.wallet_balance || 0),
    wallet_pending_sum: Number(wallet[0]?.wallet_pending || 0),
  };
}

async function getTableColumns(client, tableName) {
  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName],
  );
  return new Set((result.rows || []).map((row) => row.column_name));
}

async function ensureSeedUser(client, kind) {
  const firebaseUid = `${seedKey}-${kind}`;
  const existing = await client.query(
    `SELECT id, firebase_uid, email, full_name
     FROM users
     WHERE firebase_uid = $1 OR email = $2
     LIMIT 1`,
    [firebaseUid, `${firebaseUid.toLowerCase()}@fixture.local`],
  );
  if (existing.rows?.[0]) {
    if (!String(existing.rows[0].firebase_uid || '').startsWith('DEBUG-TAX-SEED-')) {
      throw new Error(`Refusing to reuse non-debug user ${existing.rows[0].id}`);
    }
    return { ...existing.rows[0], created: false };
  }

  const columns = await getTableColumns(client, 'users');
  const desired = {
    firebase_uid: firebaseUid,
    email: `${firebaseUid.toLowerCase()}@fixture.local`,
    phone: null,
    full_name: kind === 'provider' ? 'DEBUG Tax Seed Provider' : 'DEBUG Tax Seed Customer',
    password_hash: 'DEBUG_TAX_SEED_NO_LOGIN',
    role: 'user',
    provider_status: kind === 'provider' ? 'VERIFIED' : 'UNVERIFIED',
    kyc_level: 'level_2',
    kyc_status: 'verified',
    wallet_balance: 0,
    wallet_pending: 0,
    account_status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
  };
  const insertCols = Object.keys(desired).filter((column) => columns.has(column));
  const params = insertCols.map((column) => desired[column]);
  const placeholders = insertCols.map((_, idx) => `$${idx + 1}`).join(', ');
  const inserted = await client.query(
    `INSERT INTO users (${insertCols.join(', ')}) VALUES (${placeholders}) RETURNING id, firebase_uid, email, full_name`,
    params,
  );
  return { ...inserted.rows[0], created: true };
}

async function ensureTaxProfile(client, user, snapshot) {
  await client.query(
    `INSERT INTO tax_user_profiles
       (user_id, legal_name, tax_id, tax_entity_type, registered_address, branch_code, branch_name, country, email, verified_status, reviewed_by, reviewed_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 'TH', $8, 'verified', $9, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       legal_name = EXCLUDED.legal_name,
       tax_id = EXCLUDED.tax_id,
       tax_entity_type = EXCLUDED.tax_entity_type,
       registered_address = EXCLUDED.registered_address,
       branch_code = EXCLUDED.branch_code,
       branch_name = EXCLUDED.branch_name,
       country = EXCLUDED.country,
       email = EXCLUDED.email,
       verified_status = 'verified',
       reviewed_by = EXCLUDED.reviewed_by,
       reviewed_at = NOW(),
       updated_at = NOW()`,
    [
      user.id,
      snapshot.legal_name,
      snapshot.tax_id,
      snapshot.tax_entity_type,
      snapshot.registered_address,
      snapshot.branch_code,
      snapshot.branch_name || null,
      user.email || null,
      seedActor,
    ],
  );
}

async function createDraftDocumentIfMissing(client, {
  sourceEventId,
  documentType,
  partyRole,
  partyUserId,
  buyerSnapshot,
  sourceEventType,
  sourceSnapshot,
  line,
}) {
  const existing = await client.query(
    `SELECT id, status, document_no FROM fiscal_documents
     WHERE source_event_id = $1 AND document_type = $2 AND party_role = $3
     LIMIT 1`,
    [sourceEventId, documentType, partyRole],
  );
  if (existing.rows?.[0]) return { id: existing.rows[0].id, created: false, document_no: existing.rows[0].document_no };

  const doc = await client.query(
    `INSERT INTO fiscal_documents
       (document_type, status, source_event_id, source_event_type, party_user_id, party_role,
        seller_snapshot, buyer_snapshot, source_snapshot, subtotal_amount, vat_amount, wht_amount,
        total_amount, created_by, updated_by)
     VALUES ($1, 'draft', $2, $3, $4::uuid, $5, $6::jsonb, $7::jsonb, $8::jsonb,
             $9, $10, $11, $12, 'dev_seed_tax_audit', 'dev_seed_tax_audit')
     RETURNING id`,
    [
      documentType,
      sourceEventId,
      sourceEventType,
      partyUserId,
      partyRole,
      JSON.stringify(sellerSnapshot),
      JSON.stringify(buyerSnapshot),
      JSON.stringify(sourceSnapshot || {}),
      line.taxable_amount,
      line.vat_amount,
      line.wht_amount || 0,
      line.total_amount,
    ],
  );
  await client.query(
    `INSERT INTO fiscal_document_lines
       (document_id, line_no, description, quantity, unit_amount, taxable_amount,
        vat_rate_percent, vat_amount, wht_rate_percent, wht_amount, total_amount, metadata)
     VALUES ($1::uuid, 1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [
      doc.rows[0].id,
      line.description,
      line.unit_amount,
      line.taxable_amount,
      line.vat_rate_percent || 0,
      line.vat_amount || 0,
      line.wht_rate_percent || 0,
      line.wht_amount || 0,
      line.total_amount,
      JSON.stringify(line.metadata || {}),
    ],
  );
  return { id: doc.rows[0].id, created: true, document_no: null, status: 'draft' };
}

async function seed(client) {
  const provider = await ensureSeedUser(client, 'provider');
  const customer = await ensureSeedUser(client, 'customer');
  await ensureTaxProfile(client, provider, providerSnapshot);
  await ensureTaxProfile(client, customer, customerSnapshot);
  const withdrawalSourceId = `${seedKey}-WITHDRAWAL-FEE`;
  const whtSourceId = `${seedKey}-PROVIDER-WHT`;

  await client.query(
    `INSERT INTO payment_ledger_audit
       (id, event_type, payment_id, gateway, job_id, amount, currency, status,
        bill_no, transaction_no, user_id, provider_id, gateway_fee_amount, platform_margin_amount, net_amount, metadata, created_by)
     VALUES ($1, 'user_payout_withdrawal', $2, 'wallet', $3, 1000, 'THB', 'completed',
             $4, $5, $6, $7, 10, 20, 970, $8::jsonb, $9)
     ON CONFLICT (id) DO NOTHING`,
    [
      `${withdrawalSourceId}-LEDGER`,
      `${seedKey}-WITHDRAWAL-PAYMENT`,
      `${seedKey}-WITHDRAWAL-JOB`,
      `${seedKey}-WITHDRAWAL-BILL`,
      `${seedKey}-WITHDRAWAL-TXN`,
      customer.id,
      provider.id,
      JSON.stringify({
        seed_key: seedKey,
        scenario: 'approved_withdrawal_with_platform_margin',
        principal_amount: 1000,
        gateway_fee_amount: 10,
        platform_margin_amount: 20,
        net_amount: 970,
        note: 'DEBUG-TAX-SEED ledger evidence only; wallet balances are not mutated.',
      }),
      seedActor,
    ],
  );

  const withdrawalDoc = await createDraftDocumentIfMissing(client, {
    sourceEventId: withdrawalSourceId,
    documentType: 'tax_invoice',
    partyRole: 'customer',
    partyUserId: customer.id,
    buyerSnapshot: customerSnapshot,
    sourceEventType: 'user_payout_withdrawal',
    sourceSnapshot: {
      seed_key: seedKey,
      source_ledger_id: `${withdrawalSourceId}-LEDGER`,
      note: 'Dev-only audit scenario. Withdrawal principal is not AQOND taxable revenue.',
    },
    line: {
      description: 'DEBUG-TAX-SEED withdrawal platform fee',
      unit_amount: 20,
      taxable_amount: 20,
      vat_rate_percent: 7,
      vat_amount: 1.4,
      total_amount: 21.4,
      metadata: { seed_key: seedKey, taxable_revenue_type: 'platform_fee', wallet_component: 'withdrawal_fee_margin', platform_revenue_source: 'withdrawal_fee_margin' },
    },
  });

  const whtCertificate = await createDraftDocumentIfMissing(client, {
    sourceEventId: whtSourceId,
    documentType: 'withholding_certificate',
    partyRole: 'provider',
    partyUserId: provider.id,
    buyerSnapshot: providerSnapshot,
    sourceEventType: 'provider_wht_withheld',
    sourceSnapshot: {
      seed_key: seedKey,
      source_ledger_id: `${whtSourceId}-LEDGER`,
      note: 'Dev-only audit scenario. WHT is separate from VAT and does not mutate wallet balance.',
    },
    line: {
      description: 'DEBUG-TAX-SEED provider income withholding',
      unit_amount: 1000,
      taxable_amount: 1000,
      vat_rate_percent: 0,
      vat_amount: 0,
      wht_rate_percent: 3,
      wht_amount: 30,
      total_amount: 970,
      metadata: { seed_key: seedKey, provider_earning_component: 'withholding_tax' },
    },
  });

  await client.query(
    `INSERT INTO tax_withholding_postings
       (source_event_id, source_event_type, source_payment_id, provider_user_id,
        gross_income_amount, wht_rate_percent, withheld_amount, net_payable_amount,
        eligibility_status, eligibility_reason, tax_profile_snapshot, withholding_agent_snapshot,
        wht_certificate_document_id, created_by)
     VALUES ($1, 'DEBUG_TAX_SEED_PROVIDER_INCOME', $2, $3::uuid, 1000, 3, 30, 970,
             'eligible', 'DEBUG-TAX-SEED verified profile scenario', $4::jsonb, $5::jsonb, $6::uuid,
             $7)
     ON CONFLICT (source_event_id, provider_user_id) DO UPDATE
       SET wht_certificate_document_id = EXCLUDED.wht_certificate_document_id`,
    [
      whtSourceId,
      `${seedKey}-WHT-PAYMENT`,
      provider.id,
      JSON.stringify(providerSnapshot),
      JSON.stringify(sellerSnapshot),
      whtCertificate.id,
      seedActor,
    ],
  );
  await client.query(
    `INSERT INTO payment_ledger_audit
       (id, event_type, payment_id, gateway, job_id, amount, currency, status,
        bill_no, transaction_no, provider_id, metadata, created_by)
     VALUES ($1, 'provider_wht_withheld', $2, 'wallet', $3, 30, 'THB', 'completed',
             $4, $5, $6, $7::jsonb, $8)
     ON CONFLICT (id) DO NOTHING`,
    [
      `${whtSourceId}-LEDGER`,
      `${seedKey}-WHT-PAYMENT`,
      `${seedKey}-WHT-JOB`,
      `${seedKey}-WHT-BILL`,
      `${seedKey}-WHT-TXN`,
      provider.id,
      JSON.stringify({
        seed_key: seedKey,
        withholding_posting_source_event_id: whtSourceId,
        gross_income_amount: 1000,
        withheld_amount: 30,
        net_payable_amount: 970,
        note: 'DEBUG-TAX-SEED WHT ledger evidence only; wallet balances are not mutated.',
      }),
      seedActor,
    ],
  );

  const verification = await verifySeed(client);
  return { provider_user: provider, customer_user: customer, withdrawal_ledger_id: `${withdrawalSourceId}-LEDGER`, wht_ledger_id: `${whtSourceId}-LEDGER`, withdrawalDoc, whtCertificate, verification };
}

async function verifySeed(client) {
  const result = await client.query(
    `SELECT
       COALESCE(SUM(tw.gross_income_amount),0)::numeric AS gross_income_amount,
       COALESCE(SUM(tw.withheld_amount),0)::numeric AS withheld_amount,
       COALESCE(SUM(tw.net_payable_amount),0)::numeric AS net_payable_amount,
       COUNT(tw.id)::int AS wht_posting_count,
       COUNT(wd.id)::int AS wht_certificate_draft_count,
       COUNT(xd.id)::int AS withdrawal_document_draft_count,
       COUNT(wl.id)::int AS wallet_flow_ledger_count
     FROM tax_withholding_postings tw
     LEFT JOIN fiscal_documents wd
       ON wd.id = tw.wht_certificate_document_id
      AND wd.document_type = 'withholding_certificate'
      AND wd.status = 'draft'
     LEFT JOIN fiscal_documents xd
       ON xd.source_event_id = $2
      AND xd.source_event_type = 'user_payout_withdrawal'
      AND xd.status = 'draft'
     LEFT JOIN payment_ledger_audit wl
       ON wl.id = $3
      AND wl.event_type = 'user_payout_withdrawal'
     WHERE tw.source_event_id = $1`,
    [`${seedKey}-PROVIDER-WHT`, `${seedKey}-WITHDRAWAL-FEE`, `${seedKey}-WITHDRAWAL-FEE-LEDGER`],
  );
  const row = result.rows[0] || {};
  return {
    wht_posting_count: Number(row.wht_posting_count || 0),
    gross_income_amount: Number(row.gross_income_amount || 0),
    withheld_amount: Number(row.withheld_amount || 0),
    net_payable_amount: Number(row.net_payable_amount || 0),
    wht_formula_ok: Number(row.gross_income_amount || 0) === Number(row.withheld_amount || 0) + Number(row.net_payable_amount || 0),
    wht_certificate_draft_count: Number(row.wht_certificate_draft_count || 0),
    withdrawal_document_draft_count: Number(row.withdrawal_document_draft_count || 0),
    wallet_flow_ledger_count: Number(row.wallet_flow_ledger_count || 0),
  };
}

async function main() {
  assertDevSeedAllowed();
  const client = await pool.connect();
  try {
    const before = await getCounts(client);
    if (!execute) {
      console.log(JSON.stringify({
        mode: 'dry-run',
        seed_key: seedKey,
        db: getDbIdentity(),
        before,
        would_create: [
          `${seedKey}-provider test user`,
          `${seedKey}-customer test user`,
          'verified tax_user_profiles for both test users',
          'user_payout_withdrawal ledger evidence row',
          'draft withdrawal fee tax_invoice',
          'draft withholding_certificate',
          'tax_withholding_posting with gross 1000, WHT 30, net 970',
          'provider_wht_withheld ledger evidence row',
        ],
        wallet_note: 'No users.wallet_balance/users.wallet_pending changes are performed by this script.',
      }, null, 2));
      return;
    }
    await client.query('BEGIN');
    const created = await seed(client);
    const after = await getCounts(client);
    await client.query('COMMIT');
    console.log(JSON.stringify({
      mode: 'execute',
      seed_key: seedKey,
      created,
      before,
      after,
      wallet_aggregate_unchanged:
        before.wallet_balance_sum === after.wallet_balance_sum &&
        before.wallet_pending_sum === after.wallet_pending_sum,
    }, null, 2));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { });
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
