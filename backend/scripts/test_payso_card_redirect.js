/**
 * Regression: PaySo card deposit redirect (hosted payment page)
 *
 * Usage:
 *   node backend/scripts/test_payso_card_redirect.js
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createPaysoCardWalletDepositCharge,
  createPaysoTrueMoneyWalletDepositCharge,
  createPaysoMobileBankingRedirectWalletDepositCharge,
  buildPaysoCardRefNo,
  buildPaysoCardPaymentHash,
} from '../services/paysoService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

let pass = 0;
let fail = 0;

function ok(name) {
  pass += 1;
  console.log(`  PASS  ${name}`);
}

function bad(name, err) {
  fail += 1;
  console.error(`  FAIL  ${name}`);
  if (err) console.error(err);
}

async function run(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (e) {
    bad(name, e);
  }
}

await run('buildPaysoCardRefNo is 10 digits', async () => {
  const r = buildPaysoCardRefNo('test-user-uuid');
  if (!/^\d{10}$/.test(r)) throw new Error(`expected 10 digits, got "${r}"`);
});

await run('buildPaysoCardPaymentHash returns base64', async () => {
  const h = buildPaysoCardPaymentHash('35753345', '1234567890', 10, 'secret');
  if (!h || typeof h !== 'string') throw new Error('empty hash');
});

await run('createPaysoCardWalletDepositCharge returns authorization_uri', async () => {
  const pr = await createPaysoCardWalletDepositCharge({
    amountThb: 10,
    userUuid: 'cea372ca-f0ad-4587-805f-cd48569e42b8',
    customerEmail: 'test@test.com',
    returnUrl: 'http://localhost:5173/profile',
  });
  if (!pr.ok) throw new Error(pr.error || 'not ok');
  if (!pr.authorization_uri || !String(pr.authorization_uri).includes('thaiepay.com')) {
    throw new Error(`missing redirect uri: ${pr.authorization_uri || '(empty)'}`);
  }
  if (!pr.payso_reference_id) throw new Error('missing reference');
  console.log('       ref:', pr.payso_reference_id);
  console.log('       uri:', pr.authorization_uri.slice(0, 80) + '...');
});

await run('createPaysoTrueMoneyWalletDepositCharge returns authorization_uri', async () => {
  const pr = await createPaysoTrueMoneyWalletDepositCharge({
    amountThb: 10,
    userUuid: 'cea372ca-f0ad-4587-805f-cd48569e42b8',
    customerEmail: 'test@test.com',
    returnUrl: 'http://localhost:5173/profile',
  });
  if (!pr.ok) throw new Error(pr.error || 'not ok');
  if (!pr.authorization_uri || !String(pr.authorization_uri).includes('thaiepay.com')) {
    throw new Error(`missing redirect uri: ${pr.authorization_uri || '(empty)'}`);
  }
});

await run('createPaysoMobileBankingRedirectWalletDepositCharge returns authorization_uri', async () => {
  const pr = await createPaysoMobileBankingRedirectWalletDepositCharge({
    amountThb: 10,
    userUuid: 'cea372ca-f0ad-4587-805f-cd48569e42b8',
    customerEmail: 'test@test.com',
    returnUrl: 'http://localhost:5173/profile',
  });
  if (!pr.ok) throw new Error(pr.error || 'not ok');
  if (!pr.authorization_uri || !String(pr.authorization_uri).includes('thaiepay.com')) {
    throw new Error(`missing redirect uri: ${pr.authorization_uri || '(empty)'}`);
  }
});

if (fail) {
  console.error(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}
console.log(`\n${pass} passed, ${fail} failed`);
