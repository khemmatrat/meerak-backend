import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
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
console.log('html length', html.length);
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim()).filter(Boolean);
console.log('scripts', scripts.length);
for (let i = 0; i < scripts.length; i++) {
  const s = scripts[i];
  if (s.length > 50) {
    console.log(`\n--- script ${i} (${s.length} chars) ---`);
    console.log(s.slice(0, 1500));
  }
}

const onload = html.match(/onload\s*=\s*['"]([^'"]+)['"]/i)?.[1];
const onsubmit = html.match(/onsubmit\s*=\s*['"]([^'"]+)['"]/i)?.[1];
console.log('\nonload:', onload);
console.log('onsubmit:', onsubmit);
console.log('\nbody snippet:', html.replace(/\s+/g, ' ').slice(0, 1200));
