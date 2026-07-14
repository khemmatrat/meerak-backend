import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPaysoMobileBankingRedirectWalletDepositCharge } from '../services/paysoService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pr = await createPaysoMobileBankingRedirectWalletDepositCharge({
  amountThb: 10,
  userUuid: '7e585383-f1ea-488e-8b3f-37885c5ffa88',
  customerEmail: 't@t.com',
  returnUrl: 'http://localhost/profile',
});
const html = await (await fetch(pr.authorization_uri)).text();
const baseFields = {};
for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/gi)) {
  const tag = m[0];
  const name = tag.match(/name="([^"]+)"/i)?.[1];
  const val = tag.match(/value="([^"]*)"/i)?.[1];
  if (name) baseFields[name] = val ?? '';
}
delete baseFields.paymenttype;

async function probe(paymenttype) {
  const fields = { ...baseFields, paymenttype };
  const res = await fetch('https://payments.paysolutions.asia/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    const inner = JSON.parse(parsed.data);
    const pfIdx = inner[0]?.paymentForce;
    const pf = inner[pfIdx];
    if (!pf) return { paymenttype, err: 'no paymentForce' };
    const status = inner[pf.status];
    const showback = inner[pf.showback];
    const message = inner[inner[inner[0].paymentResponse]?.message];
    return { paymenttype, status, showback, message };
  } catch (e) {
    return { paymenttype, err: text.slice(0, 120) };
  }
}

const codes = ['D', 'PP', 'V', 'M', 'WE', 'AL', 'TM', 'TR', 'TW', 'T', 'W', 'EW', 'ibanking', 'truemoney', 'wallet', 'promptpay'];
for (const c of codes) {
  const r = await probe(c);
  console.log(r);
}
