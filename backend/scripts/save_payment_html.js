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
fields.paymenttype = 'D';

const res = await fetch('https://payments.paysolutions.asia/payment', {
  method: 'POST',
  redirect: 'manual',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'User-Agent': 'Mozilla/5.0',
  },
  body: new URLSearchParams(fields).toString(),
});
const text = await res.text();
fs.writeFileSync(path.join(__dirname, 'tmp_payment_html.html'), text, 'utf8');
console.log('saved', text.length);
for (const kw of ['authorize', 'channel', 'redirect', 'router', 'paymentForce', 'ibanking', 'truemoney', 'Internet']) {
  const idx = text.toLowerCase().indexOf(kw.toLowerCase());
  console.log(kw, idx >= 0 ? `found@${idx}: ${text.slice(idx, idx + 120).replace(/\s+/g, ' ')}` : 'not found');
}
