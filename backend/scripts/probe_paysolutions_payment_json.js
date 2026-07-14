import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  createPaysoMobileBankingRedirectWalletDepositCharge,
  createPaysoTrueMoneyWalletDepositCharge,
  createPaysoCardWalletDepositCharge,
} from '../services/paysoService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const channel = process.argv[2] || 'mobile_banking';
const creators = {
  mobile_banking: createPaysoMobileBankingRedirectWalletDepositCharge,
  truemoney: createPaysoTrueMoneyWalletDepositCharge,
  card: createPaysoCardWalletDepositCharge,
};
const pr = await creators[channel]({
  amountThb: 10,
  userUuid: '7e585383-f1ea-488e-8b3f-37885c5ffa88',
  customerEmail: 't@t.com',
  returnUrl: 'http://localhost/profile',
});

const html = await (await fetch(pr.authorization_uri)).text();
const action = html.match(/action="([^"]+)"/i)?.[1];
const fields = {};
for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/gi)) {
  const tag = m[0];
  const name = tag.match(/name="([^"]+)"/i)?.[1];
  const val = tag.match(/value="([^"]*)"/i)?.[1];
  if (name) fields[name] = val ?? '';
}

const res = await fetch(action, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
  body: new URLSearchParams(fields).toString(),
});
const text = await res.text();
fs.writeFileSync(path.join(__dirname, 'tmp_payso_payment_response.json'), text, 'utf8');

let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = null;
}

console.log('channel:', channel);
console.log('paymenttype field:', fields.paymenttype || '(none)');
console.log('status:', res.status);
console.log('response length:', text.length);

if (parsed?.data) {
  try {
    const inner = JSON.parse(parsed.data);
    console.log('inner array length:', inner.length);
    // paymentForce index
    const map = inner[0];
    const pfIdx = map?.paymentForce;
    const prIdx = map?.paymentResponse;
    console.log('paymentForce idx:', pfIdx, 'value:', inner[pfIdx]);
    console.log('paymentResponse idx:', prIdx);
    const prObj = inner[prIdx];
    console.log('paymentResponse keys:', prObj && typeof prObj === 'object' ? Object.keys(prObj).slice(0, 20) : prObj);
    // dump string values from inner array
    for (let i = 0; i < inner.length; i++) {
      const v = inner[i];
      if (typeof v === 'string' && (v.includes('authorize') || v.includes('channel') || v.includes('paysolutions'))) {
        console.log(`inner[${i}]`, v.slice(0, 200));
      }
    }
  } catch (e) {
    console.log('inner parse err', e.message);
    console.log(text.slice(0, 1000));
  }
} else {
  console.log(text.slice(0, 1000));
}

// search whole text for authorize URLs
const urls = [...text.matchAll(/https?:\\\/\\\/[^"\\]+/g)].map((m) => m[0].replace(/\\\//g, '/'));
const channelUrls = urls.filter((u) => u.includes('authorize') || u.includes('/channel'));
console.log('\nauthorize/channel urls found:', channelUrls.slice(0, 5));
