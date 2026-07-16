/** Quick check: storefront proxy auth for rider PromptPay + readiness */
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', 'backend', '.env') });

const STOREFRONT = (process.env.STOREFRONT_URL || 'http://127.0.0.1:3003').replace(/\/$/, '');
const USER_ID = process.env.USER_ID || 'dc8bcd17-ac18-4dfa-a1b0-97c568ed7c21';
const JWT_SECRET = process.env.JWT_SECRET || process.env.MEERAK_JWT_SECRET;

function mintJwt(userId) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET missing in .env.local');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, role: 'USER', iat: now, exp: now + 3600 }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

const token = mintJwt(USER_ID);
const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
  'X-User-Id': USER_ID,
};

const ready = await fetch(`${STOREFRONT}/api/rider/ready`, { headers });
const readyData = await ready.json().catch(() => ({}));
console.log('ready:', ready.status, readyData.ready, readyData.storefront?.jwt_configured);

const res = await fetch(`${STOREFRONT}/api/rider/credits/topup/promptpay`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ amount: 10 }),
});
const data = await res.json().catch(() => ({}));
console.log('promptpay status:', res.status);
console.log('charge_id:', data.charge_id || data.error);
process.exit(res.ok && readyData.storefront?.jwt_configured ? 0 : 1);
