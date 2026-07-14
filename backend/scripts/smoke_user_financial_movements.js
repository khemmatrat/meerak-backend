/**
 * Smoke: GET /api/admin/users/:id/financial-movements (401 without auth)
 * Usage: node backend/scripts/smoke_user_financial_movements.js
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const base = String(process.env.BACKEND_PUBLIC_URL || 'http://localhost:3001').replace(/\/$/, '');
const userId = process.argv[2] || '7e585383-f1ea-488e-8b3f-37885c5ffa88';

const res = await fetch(`${base}/api/admin/users/${encodeURIComponent(userId)}/financial-movements?limit=5`);
console.log('status', res.status, res.status === 401 ? '(auth required — OK)' : '');
if (res.status === 200) {
  const j = await res.json();
  console.log('items', j.items?.length, 'has_more', j.has_more);
  console.log('summary deposits', j.summary?.deposits);
}
