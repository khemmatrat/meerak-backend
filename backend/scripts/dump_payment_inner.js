import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
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
const fields = {};
for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/gi)) {
  const tag = m[0];
  const name = tag.match(/name="([^"]+)"/i)?.[1];
  const val = tag.match(/value="([^"]*)"/i)?.[1];
  if (name) fields[name] = val ?? '';
}
const res = await fetch('https://payments.paysolutions.asia/payment', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields),
});
const j = JSON.parse(await res.text());
const inner = JSON.parse(j.data);
fs.writeFileSync(path.join(__dirname, 'tmp_payment_inner.json'), JSON.stringify(inner, null, 2), 'utf8');
console.log('written tmp_payment_inner.json, len', inner.length);
for (let i = 0; i < inner.length; i++) {
  const v = inner[i];
  const preview = typeof v === 'string' ? v.slice(0, 80) : JSON.stringify(v)?.slice(0, 120);
  console.log(i, typeof v, preview);
}
