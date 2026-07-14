import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPaysoMobileBankingRedirectWalletDepositCharge } from '../services/paysoService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function getBaseFields() {
  const pr = await createPaysoMobileBankingRedirectWalletDepositCharge({
    amountThb: 10,
    userUuid: '7e585383-f1ea-488e-8b3f-37885c5ffa88',
    customerEmail: 't@t.com',
    returnUrl: 'http://localhost/profile',
  });
  const html = await (await fetch(pr.authorization_uri)).text();
  const fields = {};
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/gi)) {
    const tag = m[0];
    const name = tag.match(/name="([^"]+)"/i)?.[1];
    const val = tag.match(/value="([^"]*)"/i)?.[1];
    if (name) fields[name] = val ?? '';
  }
  return fields;
}

const baseFields = await getBaseFields();

async function probe(extra = {}) {
  const fields = { ...baseFields, ...extra };
  const res = await fetch('https://payments.paysolutions.asia/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
    body: new URLSearchParams(fields).toString(),
  });
  const text = await res.text();
  const parsed = JSON.parse(text);
  const inner = JSON.parse(parsed.data);
  const pfIdx = inner[0].paymentForce;
  const pf = inner[pfIdx];
  const statusIdx = pf?.status;
  const showbackIdx = pf?.showback;
  const statusVal = inner[statusIdx];
  const showbackVal = inner[showbackIdx];
  const pt = fields.paymenttype || fields.paymentForce || fields.channel || '(base)';
  return { pt, statusVal, showbackVal, pf };
}

const candidates = [
  {},
  { paymenttype: 'truemoney' },
  { paymenttype: 'ibanking' },
  { paymenttype: 'wallet' },
  { paymenttype: 'internetbanking' },
  { paymenttype: 'mobilebanking' },
  { paymenttype: 'qr' },
  { paymenttype: 'promptpay' },
  { paymenttype: 'card' },
  { paymenttype: 'creditcard' },
  { paymenttype: '1' },
  { paymenttype: '2' },
  { paymenttype: '3' },
  { paymenttype: '4' },
  { paymentForce: 'ibanking' },
  { paymentForce: 'truemoney' },
  { paymentForce: '3' },
  { paymentForce: '4' },
  { channel: 'wallet' },
  { channel: 'ibanking' },
];

for (const extra of candidates) {
  try {
    const r = await probe(extra);
    console.log(JSON.stringify(extra), '=> status:', r.statusVal, 'showback:', r.showbackVal);
  } catch (e) {
    console.log(JSON.stringify(extra), '=> ERR', e.message);
  }
}
