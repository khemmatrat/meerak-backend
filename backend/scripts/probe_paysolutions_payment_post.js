/**
 * POST datainclusion form to payments.paysolutions.asia/payment and follow redirects.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createPaysoMobileBankingRedirectWalletDepositCharge,
  createPaysoTrueMoneyWalletDepositCharge,
} from '../services/paysoService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const channel = process.argv[2] || 'mobile_banking';
const pr =
  channel === 'truemoney'
    ? await createPaysoTrueMoneyWalletDepositCharge({
      amountThb: 10,
      userUuid: '7e585383-f1ea-488e-8b3f-37885c5ffa88',
      customerEmail: 't@t.com',
      returnUrl: 'http://localhost/profile',
    })
    : await createPaysoMobileBankingRedirectWalletDepositCharge({
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

console.log('channel:', channel);
console.log('POST', action);
console.log('fields:', Object.keys(fields).join(', '));

async function followPost(url, body, depth = 0) {
  const res = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0',
    },
    body: new URLSearchParams(body).toString(),
  });
  const loc = res.headers.get('location');
  console.log(`[${depth}] POST ${res.status} -> ${loc || '(no location)'}`);
  if (loc && [301, 302, 303, 307, 308].includes(res.status)) {
    const next = loc.startsWith('http') ? loc : new URL(loc, url).href;
    return followGet(next, depth + 1);
  }
  const text = await res.text();
  return { url, status: res.status, snippet: text.replace(/\s+/g, ' ').slice(0, 500) };
}

async function followGet(url, depth = 0) {
  console.log(`[${depth}] GET ${url.slice(0, 120)}`);
  const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' } });
  const loc = res.headers.get('location');
  if (loc && [301, 302, 303, 307, 308].includes(res.status)) {
    const next = loc.startsWith('http') ? loc : new URL(loc, url).href;
    return followGet(next, depth + 1);
  }
  const text = await res.text();
  const title = text.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim();
  return { url, status: res.status, title, snippet: text.replace(/\s+/g, ' ').slice(0, 500) };
}

const result = await followPost(action, fields);
console.log('\nfinal:', result);

// Try appending channel hints to authorize URL if we got one
if (result.url && result.url.includes('payments.paysolutions.asia/channel')) {
  const base = new URL(result.url);
  for (const [k, v] of [
    ['channel', 'wallet'],
    ['method', 'truemoney'],
    ['paymenttype', 'truemoney'],
    ['paymenttype', 'ibanking'],
    ['type', 'ibanking'],
    ['channel', 'ibanking'],
  ]) {
    const u = new URL(base.href);
    u.searchParams.set(k, v);
    const r = await followGet(u.href, 0);
    console.log(`\ntry ${k}=${v} => title: ${r.title || '(none)'} url: ${r.url?.slice(0, 100)}`);
  }
}
