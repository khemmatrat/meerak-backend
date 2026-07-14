/**
 * Full browser-like chain: datainclusion -> payment -> channel -> ibanking
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
process.env.PAYSO_CHANNEL_DEEPLINK = '0';

const { createPaysoMobileBankingRedirectWalletDepositCharge } = await import('../services/paysoService.js');

function parseFields(html) {
  const fields = {};
  for (const m of String(html).matchAll(/<input[^>]*type="hidden"[^>]*>/gi)) {
    const tag = m[0];
    const name = tag.match(/name="([^"]+)"/i)?.[1];
    const val = tag.match(/value="([^"]*)"/i)?.[1];
    if (name) fields[name] = val ?? '';
  }
  return fields;
}

function summary(label, text, expectedRef) {
  const hasUndefinedSidebar = /หมายเลขการชำระเงิน[\s\S]{0,80}undefined|product[\s\S]{0,40}undefined/i.test(text);
  const hasZeroBaht = /0\s*บาท/.test(text) && !/200/.test(text);
  const has200 = /200/.test(text);
  const hasRef = expectedRef ? text.includes(expectedRef) : false;
  console.log(label, { hasUndefinedSidebar, hasZeroBaht, has200, hasRef, len: text.length });
}

class Jar {
  cookies = new Map();
  store(res) {
    const raw = res.headers.getSetCookie?.() || [];
    const single = res.headers.get('set-cookie');
    const list = raw.length ? raw : single ? [single] : [];
    for (const c of list) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (k) this.cookies.set(k.trim(), v || '');
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function fetchJ(jar, url, opts = {}) {
  const headers = { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html', ...(opts.headers || {}) };
  const c = jar.header();
  if (c) headers.Cookie = c;
  const res = await fetch(url, { ...opts, headers, redirect: 'manual' });
  jar.store(res);
  return res;
}

const pr = await createPaysoMobileBankingRedirectWalletDepositCharge({
  amountThb: 200,
  userUuid: '7e585383-f1ea-488e-8b3f-37885c5ffa88',
  customerEmail: 't@t.com',
  returnUrl: 'http://localhost:3000/profile',
});
const ref = pr.payso_reference_id;
console.log('ref:', ref, 'datainclusion:', pr.authorization_uri?.slice(0, 80));

const jar = new Jar();
const incRes = await fetchJ(jar, pr.authorization_uri, { redirect: 'follow' });
const incHtml = await incRes.text();
const fields = parseFields(incHtml);
summary('datainclusion', incHtml, ref);

const payRes = await fetchJ(jar, 'https://payments.paysolutions.asia/payment', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields).toString(),
});
const payText = await payRes.text();
const vs = payText.match(/valueStore:"([a-f0-9]+)"/i)?.[1];
const auth = vs ? `auth_prod_${vs}` : null;
console.log('payment status', payRes.status, 'loc', payRes.headers.get('location')?.slice(0, 80));
summary('POST payment response', payText, ref);

if (!auth) {
  console.log('no authorize token');
  process.exit(1);
}

const channelUrl = `https://payments.paysolutions.asia/channel?authorize=${auth}`;
const chRes = await fetchJ(jar, channelUrl, { redirect: 'follow' });
const chText = await chRes.text();
summary('GET /channel?authorize', chText, ref);

const ibUrl = `https://payments.paysolutions.asia/channel/ibanking?authorize=${auth}`;
const ibRes = await fetchJ(jar, ibUrl, { redirect: 'follow' });
summary('GET /channel/ibanking (after channel visit)', await ibRes.text(), ref);

// Direct ibanking without visiting /channel first
const jar2 = new Jar();
const payRes2 = await fetchJ(jar2, 'https://payments.paysolutions.asia/payment', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields).toString(),
});
await payRes2.text();
const ibRes2 = await fetchJ(jar2, ibUrl, { redirect: 'follow' });
summary('GET /channel/ibanking (skip /channel)', await ibRes2.text(), ref);
