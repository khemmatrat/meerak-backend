/**
 * รันก่อน vite build --mode production
 * — ลดความเสี่ยงสลับ API key / URL ระหว่าง dev กับ prod
 * — ลำดับ merge ต้องตรงกับ mobile/vite.config.ts (โหมด production: root ทับ mobile)
 */
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mobileRoot = join(__dirname, '..');
const parentDir = join(mobileRoot, '..');

// production: root ทับ mobile — กัน mobile/.env (localhost) ทับ root .env.production
const merged = {
  ...loadEnv('production', mobileRoot, ''),
  ...loadEnv('production', parentDir, ''),
};

const prodPath = join(mobileRoot, '.env.production');
const basePath = join(mobileRoot, '.env');
const rootProdPath = join(parentDir, '.env.production');

if (!existsSync(rootProdPath) && !existsSync(prodPath)) {
  console.warn(
    '[check-production-env] ไม่พบ .env.production ที่ root หรือ mobile/.env.production — แนะนำมีอย่างน้อยหนึ่งไฟล์\n' +
      '  คัดลอก mobile/env.production.sample → mobile/.env.production หรือตั้งค่าใน repo root .env.production'
  );
}

const backendUrl = merged.VITE_BACKEND_URL || '';
const allowLocal =
  process.env.MEERAK_ALLOW_LOCALHOST_PROD === '1' || process.env.MEERAK_ALLOW_LOCALHOST_PROD === 'true';

if (!backendUrl) {
  console.error('[check-production-env] ขาด VITE_BACKEND_URL หลัง merge root + mobile/.env*');
  process.exit(1);
}

if (!allowLocal && /localhost|127\.0\.0\.1/i.test(backendUrl)) {
  console.error(
    '[check-production-env] VITE_BACKEND_URL ยังชี้ localhost — ไม่ควร build โปรดักชันแบบนี้\n' +
      '  ตั้งค่า API จริงใน root .env.production หรือ mobile/.env.production หรือตั้ง MEERAK_ALLOW_LOCALHOST_PROD=1'
  );
  process.exit(1);
}

const allowHttpBackend =
  process.env.MEERAK_ALLOW_HTTP_BACKEND === '1' ||
  process.env.MEERAK_ALLOW_HTTP_BACKEND === 'true' ||
  merged.MEERAK_ALLOW_HTTP_BACKEND === '1' ||
  merged.MEERAK_ALLOW_HTTP_BACKEND === 'true';

if (!allowHttpBackend && !/^https:\/\//i.test(backendUrl.trim())) {
  console.error(
    '[check-production-env] VITE_BACKEND_URL ควรเป็น https://... สำหรับ APK ที่จะให้ทดสอบภายนอก\n' +
      '  ถ้าใช้ staging แบบ http://IP:port ชั่วคราว ให้ตั้ง MEERAK_ALLOW_HTTP_BACKEND=1 ใน .env.production หรือ env'
  );
  process.exit(1);
}

const firebaseKey = (merged.VITE_FIREBASE_API_KEY || '').trim();
const skipFirebase =
  process.env.MEERAK_SKIP_FIREBASE_CHECK === '1' || process.env.MEERAK_SKIP_FIREBASE_CHECK === 'true';
if (!skipFirebase) {
  if (!firebaseKey || !/^AIzaSy[A-Za-z0-9_-]{20,}/.test(firebaseKey)) {
    console.error(
      '[check-production-env] ขาด VITE_FIREBASE_API_KEY ที่ถูกต้อง (รูปแบบ AIzaSy...) — หน้า Login OTP จะใช้ไม่ได้\n' +
        '  ใส่ใน root .env.production หรือ mobile/.env.production หรือตั้ง MEERAK_SKIP_FIREBASE_CHECK=1'
    );
    process.exit(1);
  }
}

console.log('[check-production-env] OK — VITE_BACKEND_URL:', backendUrl.replace(/\/+$/, ''));
console.log(
  '[check-production-env] แหล่ง env: merge(mobile แล้ว root ทับ) — พบไฟล์:',
  [
    existsSync(join(parentDir, '.env')) && 'root/.env',
    existsSync(rootProdPath) && 'root/.env.production',
    existsSync(basePath) && 'mobile/.env',
    existsSync(prodPath) && 'mobile/.env.production',
  ]
    .filter(Boolean)
    .join(', ') || '(โหลดจาก env อย่างเดียว)'
);
