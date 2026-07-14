import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPaysoMobileBankingRedirectWalletDepositCharge, createPaysoTrueMoneyWalletDepositCharge } from '../services/paysoService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function getValueStore(channel) {
  const pr =
    channel === 'truemoney'
      ? await createPaysoTrueMoneyWalletDepositCharge({ amountThb: 10, userUuid: '7e585383-f1ea-488e-8b3f-37885c5ffa88', customerEmail: 't@t.com', returnUrl: 'http://localhost/profile' })
      : await createPaysoMobileBankingRedirectWalletDepositCharge({ amountThb: 10, userUuid: '7e585383-f1ea-488e-8b3f-37885c5ffa88', customerEmail: 't@t.com', returnUrl: 'http://localhost/profile' });
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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html', 'User-Agent': 'Mozilla/5.0' },
    body: new URLSearchParams(fields).toString(),
  });
  const text = await res.text();
  const vs = text.match(/valueStore:"([a-f0-9]+)"/i)?.[1];
  return { refno: fields.refno, valueStore: vs };
}

async function checkUrl(label, url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' } });
  const text = await res.text();
  const title = text.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim();
  const hasPicker =
    /บัตรเครดิต|Credit|ชำระด้วย|TrueMoney|Internet Banking|ibanking|wallet/i.test(text) &&
    /channel\/wallet|channel\/ibanking|channel\/qrcode|fullpayment/i.test(text);
  const isGenericPicker = /channel\?authorize|เลือกช่องทาง|ชำระด้วย/i.test(text) && text.includes('qrcode');
  console.log(label, res.status, title, 'genericPicker?', isGenericPicker, 'len', text.length);
}

const mb = await getValueStore('mobile_banking');
const tm = await getValueStore('truemoney');
console.log('mb ref', mb.refno, 'vs', mb.valueStore?.slice(0, 20));
console.log('tm ref', tm.refno, 'vs', tm.valueStore?.slice(0, 20));

for (const [label, pathSeg, vs] of [
  ['mb direct', 'ibanking', mb.valueStore],
  ['mb info', 'ibanking/info', mb.valueStore],
  ['tm direct', 'wallet', tm.valueStore],
  ['tm info', 'wallet/info', tm.valueStore],
  ['generic', 'channel', mb.valueStore],
]) {
  if (!vs) continue;
  await checkUrl(label, `https://payments.paysolutions.asia/channel/${pathSeg}?authorize=auth_prod_${vs}`);
}
