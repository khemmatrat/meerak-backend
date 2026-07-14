/**
 * Probe thaiepay epaylink extra form fields for channel pre-selection.
 * Usage: node backend/scripts/probe_payso_channel_presel.js
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import https from 'https';
import { buildPaysoReferenceId } from '../services/paysoService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mid = process.env.PAYSO_MERCHANT_ID;
const secret = process.env.PAYSO_SECRET_KEY || process.env.PAYSO_MERCHANT_SECRET_KEY;

function analyze(extra = {}) {
  const ref = String(buildPaysoReferenceId(`p${Date.now()}${Math.random()}`).replace(/^0/, '1'))
    .padStart(10, '0')
    .slice(-10);
  const total = '10.00';
  const hash = crypto.createHmac('sha512', secret).update(String(mid) + ref + total).digest('base64');
  const body = new URLSearchParams({
    merchantid: mid,
    total,
    productdetail: 'test',
    cc: '00',
    customeremail: 't@t.com',
    refno: ref,
    hash,
    ...extra,
  }).toString();

  return new Promise((resolve) => {
    const req = https.request(
      'https://www.thaiepay.com/epaylink/payment.aspx?lang=t',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const loc = res.headers.location;
        if (!loc) {
          res.resume();
          return resolve({ extra, err: 'no redirect' });
        }
        const full = loc.startsWith('http') ? loc : `https://www.thaiepay.com${loc}`;
        const u = new URL(full);
        https
          .get(
            { hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': 'Mozilla/5.0' } },
            (res2) => {
              let html = '';
              res2.on('data', (c) => {
                html += c;
              });
              res2.on('end', () => {
                const lower = html.toLowerCase();
                const keywords = [
                  'truemoney',
                  'true money',
                  'ทรู',
                  'mobile banking',
                  'internet banking',
                  'ibanking',
                  'credit card',
                  'บัตร',
                  'promptpay',
                  'พร้อมเพย์',
                  'scb',
                  'kbank',
                ];
                const found = keywords.filter((k) => lower.includes(k.toLowerCase()));
                resolve({ extra, found, htmlLen: html.length });
              });
            }
          )
          .on('error', (e) => resolve({ extra, err: e.message }));
        res.resume();
      }
    );
    req.write(body);
    req.end();
  });
}

const tests = [
  {},
  { paymenttype: 'truemoney' },
  { paymenttype: 'ibanking' },
  { paymenttype: 'internetbanking' },
  { paymenttype: 'mobilebanking' },
  { paymenttype: 'mobile_banking' },
  { paymenttype: 'MobileBanking' },
  { paymenttype: 'InternetBanking' },
  { paymenttype: 'bank' },
  { paytype: 'ibanking' },
  { paychannel: 'ibanking' },
];

for (const extra of tests) {
  const r = await analyze(extra);
  console.log(JSON.stringify(extra), '=>', r.found?.join(', ') || r.err || '(none)', `len=${r.htmlLen || 0}`);
}
