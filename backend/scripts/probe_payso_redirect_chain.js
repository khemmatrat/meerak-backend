/**
 * Follow thaiepay redirect chain and inspect final PaySo portal URL.
 * Usage: node backend/scripts/probe_payso_redirect_chain.js [card|truemoney|mobile_banking]
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createPaysoTrueMoneyWalletDepositCharge,
  createPaysoMobileBankingRedirectWalletDepositCharge,
} from '../services/paysoService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const channel = process.argv[2] || 'mobile_banking';

const pr =
  channel === 'truemoney'
    ? await createPaysoTrueMoneyWalletDepositCharge({
      amountThb: 10,
      userUuid: '7e585383-f1ea-488e-8b3f-37885c5ffa88',
      customerEmail: 'test@test.com',
      returnUrl: 'http://localhost:3000/profile',
    })
    : await createPaysoMobileBankingRedirectWalletDepositCharge({
      amountThb: 10,
      userUuid: '7e585383-f1ea-488e-8b3f-37885c5ffa88',
      customerEmail: 'test@test.com',
      returnUrl: 'http://localhost:3000/profile',
    });

console.log('channel:', channel);
console.log('ok:', pr.ok, 'ref:', pr.payso_reference_id, 'err:', pr.error);
console.log('first redirect:', pr.authorization_uri);

if (!pr.authorization_uri) process.exit(1);

async function follow(url, depth = 0, max = 8) {
  if (depth >= max) return { url, depth, stop: 'max depth' };
  const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' } });
  const loc = res.headers.get('location');
  console.log(`  [${depth}] ${res.status} ${url.slice(0, 100)}`);
  if (loc && (res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307)) {
    const next = loc.startsWith('http') ? loc : new URL(loc, url).href;
    return follow(next, depth + 1, max);
  }
  const text = await res.text();
  const metaRefresh = text.match(/url=([^"'>]+)/i)?.[1];
  if (metaRefresh) {
    const next = metaRefresh.startsWith('http') ? metaRefresh : new URL(metaRefresh, url).href;
    console.log(`  [${depth}] meta refresh -> ${next.slice(0, 100)}`);
    return follow(next, depth + 1, max);
  }
  const jsLoc = text.match(/window\.location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i)?.[1];
  if (jsLoc) {
    const next = jsLoc.startsWith('http') ? jsLoc : new URL(jsLoc, url).href;
    console.log(`  [${depth}] js redirect -> ${next.slice(0, 100)}`);
    return follow(next, depth + 1, max);
  }
  return { url, depth, status: res.status, htmlLen: text.length, snippet: text.replace(/\s+/g, ' ').slice(0, 400) };
}

const final = await follow(pr.authorization_uri);
console.log('\nfinal:', final);
