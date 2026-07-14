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
const inputs = [...html.matchAll(/<input[^>]*type="hidden"[^>]*>/gi)].map((t) => t[0]);
console.log('channel:', channel);
console.log('form action:', html.match(/action="([^"]+)"/i)?.[1]);
for (const i of inputs) {
  const name = i.match(/name="([^"]+)"/i)?.[1];
  const val = i.match(/value="([^"]*)"/i)?.[1];
  console.log(`  ${name} = ${val}`);
}
