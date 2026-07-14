import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPaysoMobileBankingRedirectWalletDepositCharge } from '../services/paysoService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function freshFields(paymenttypeOverride) {
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
  if (paymenttypeOverride != null) fields.paymenttype = paymenttypeOverride;
  return fields;
}

async function postPayment(fields, accept) {
  const res = await fetch('https://payments.paysolutions.asia/payment', {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: accept,
      'User-Agent': 'Mozilla/5.0',
    },
    body: new URLSearchParams(fields).toString(),
  });
  const loc = res.headers.get('location');
  const ct = res.headers.get('content-type');
  const text = await res.text();
  return { status: res.status, loc, ct, textLen: text.length, text: text.slice(0, 500) };
}

for (const pt of ['ibanking', 'D', 'truemoney', 'TM']) {
  const fields = await freshFields(pt);
  console.log('\n=== paymenttype', pt, 'ref', fields.refno, '===');
  const htmlRes = await postPayment(fields, 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  console.log('Accept html:', htmlRes.status, htmlRes.loc || '(no loc)', htmlRes.ct, 'len', htmlRes.textLen);
  if (htmlRes.loc) console.log('  location:', htmlRes.loc.slice(0, 150));
  if (htmlRes.text.includes('channel')) console.log('  body has channel');
  const jsonRes = await postPayment(fields, 'application/json');
  console.log('Accept json:', jsonRes.status, jsonRes.loc || '(no loc)', jsonRes.textLen);
}
