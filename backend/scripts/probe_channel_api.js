import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPaysoMobileBankingRedirectWalletDepositCharge } from '../services/paysoService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API_KEY = 'JpywR23@W8';
const CHANNEL_API = 'https://apis.paysolutions.asia/channel/api/';

async function initPayment(paymenttype) {
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
  fields.paymenttype = paymenttype;
  const res = await fetch('https://payments.paysolutions.asia/payment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html',
      'User-Agent': 'Mozilla/5.0',
    },
    body: new URLSearchParams(fields),
  });
  const text = await res.text();
  const vs = text.match(/valueStore:"([a-f0-9]+)"/i)?.[1];
  return { refno: fields.refno, valueStore: vs, paymenttype, fields };
}

async function tryChannelApi(path, method, body, headers = {}) {
  const url = CHANNEL_API.replace(/\/$/, '') + path;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: API_KEY,
      'X-API-Key': API_KEY,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { url, status: res.status, text: text.slice(0, 500) };
}

const init = await initPayment('TM');
console.log('init', { refno: init.refno, valueStore: init.valueStore?.slice(0, 40), paymenttype: init.paymenttype });

const attempts = [
  ['POST', '/select', { refno: init.refno, channel: 'TM', valueStore: init.valueStore }],
  ['POST', '/select', { refno: init.refno, paymenttype: 'TM', valueStore: init.valueStore }],
  ['POST', '/select', { refno: init.refno, paymenttype: 'ibanking', valueStore: init.valueStore }],
  ['POST', '/authorize', { refno: init.refno, merchantid: init.fields.merchantid, paymenttype: 'TM' }],
  ['POST', '/create', init.fields],
  ['GET', `/?refno=${init.refno}&merchantid=${init.fields.merchantid}`, null],
  ['GET', `?refno=${init.refno}&paymenttype=TM`, null],
  ['POST', '/', { refno: init.refno, paymenttype: 'TM', merchantID: init.fields.merchantid }],
  ['POST', '/channel', { refno: init.refno, type: 'TM' }],
];

for (const [method, p, body] of attempts) {
  try {
    const r = await tryChannelApi(p, method, body);
    console.log('\n', method, p, '=>', r.status, r.text);
  } catch (e) {
    console.log('\n', method, p, '=> ERR', e.message);
  }
}
