/**
 * Compare PaySo session: browser-like POST chain vs direct /channel/ibanking deep link.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPaysoMobileBankingRedirectWalletDepositCharge } from '../services/paysoService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

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

function extractValueStore(text) {
  return String(text).match(/valueStore:"([a-f0-9]+)"/i)?.[1] || null;
}

function extractAuthorizeFromUrl(url) {
  const u = new URL(url);
  return u.searchParams.get('authorize') || null;
}

function inspect(label, text) {
  const hasUndefined = /undefined/.test(text);
  const refMatch = text.match(/refno["':\s]+(\d{10})/i) || text.match(/(\d{10})/);
  const amountMatch = text.match(/total["':\s]+([\d.]+)/i) || text.match(/(\d+)\s*บาท/);
  const productMatch = text.match(/AQOND wallet/i);
  console.log(label, {
    len: text.length,
    hasUndefined,
    ref: refMatch?.[1] || refMatch?.[0],
    amountHint: amountMatch?.[1] || amountMatch?.[0],
    hasProduct: !!productMatch,
    title: text.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim(),
  });
}

class Jar {
  constructor() {
    this.cookies = new Map();
  }
  store(res, url) {
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
    if (!this.cookies.size) return '';
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function fetchJar(jar, url, opts = {}) {
  const headers = { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html', ...(opts.headers || {}) };
  const cookie = jar.header();
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(url, { ...opts, headers, redirect: 'manual' });
  jar.store(res, url);
  return res;
}

const pr = await createPaysoMobileBankingRedirectWalletDepositCharge({
  amountThb: 200,
  userUuid: '7e585383-f1ea-488e-8b3f-37885c5ffa88',
  customerEmail: 't@t.com',
  returnUrl: 'http://localhost:3000/profile',
});

console.log('charge ref:', pr.payso_reference_id);
console.log('returned uri:', pr.authorization_uri?.slice(0, 90));

// Get datainclusion from thaiepay (disable deeplink temporarily by using raw flow)
const thaiepayRes = await fetch(pr.authorization_uri, { redirect: 'manual' });
const datainclusionUrl = thaiepayRes.headers.get('location')?.includes('datainclusion')
  ? thaiepayRes.headers.get('location')
  : pr.authorization_uri.includes('datainclusion')
    ? pr.authorization_uri
    : null;

// Re-create without deeplink - fetch datainclusion directly via thaiepay chain
const jar = new Jar();
let datainclusionUri = pr.authorization_uri;
if (datainclusionUri.includes('channel/ibanking')) {
  // reverse: create charge with deeplink disabled
  process.env.PAYSO_CHANNEL_DEEPLINK = '0';
  const { createPaysoMobileBankingRedirectWalletDepositCharge: createMb } = await import('../services/paysoService.js');
  const pr2 = await createMb({
    amountThb: 200,
    userUuid: '7e585383-f1ea-488e-8b3f-37885c5ffa88',
    customerEmail: 't@t.com',
    returnUrl: 'http://localhost:3000/profile',
  });
  datainclusionUri = pr2.authorization_uri;
  console.log('datainclusion uri:', datainclusionUri?.slice(0, 90));
}

const incRes = await fetchJar(jar, datainclusionUri, { redirect: 'follow' });
const incHtml = await incRes.text();
const fields = parseFields(incHtml);
console.log('form fields:', Object.keys(fields).join(', '), 'refno:', fields.refno);

const postUrl = 'https://payments.paysolutions.asia/payment';
const payRes = await fetchJar(jar, postUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields).toString(),
});
const payText = await payRes.text();
const valueStore = extractValueStore(payText);
const authorize = valueStore ? `auth_prod_${valueStore}` : extractAuthorizeFromUrl(payRes.headers.get('location') || '');
console.log('valueStore:', valueStore?.slice(0, 24), 'pay status:', payRes.status);

inspect('POST /payment body', payText);

const channelGeneric = `https://payments.paysolutions.asia/channel?authorize=${authorize}`;
const channelIbank = `https://payments.paysolutions.asia/channel/ibanking?authorize=${authorize}`;

const genRes = await fetchJar(jar, channelGeneric, { redirect: 'follow' });
inspect('GET /channel (with cookies)', await genRes.text());

const ibRes = await fetchJar(jar, channelIbank, { redirect: 'follow' });
inspect('GET /channel/ibanking (with cookies)', await ibRes.text());

const ibDirectRes = await fetch(channelIbank, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' } });
inspect('GET /channel/ibanking (NO cookies)', await ibDirectRes.text());
