/**
 * รันหลัง vite build — ตรวจว่า asset ใน public (เช่น .mp3) ถูกคัดลอกไป dist และไม่มี pattern ผิดปกติ
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mobileRoot = join(__dirname, '..');
const distRoot = join(mobileRoot, 'dist');
const publicRoot = join(mobileRoot, 'public');

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else files.push(p);
  }
  return files;
}

if (!existsSync(join(distRoot, 'index.html'))) {
  console.error('[verify-production-build] ไม่พบ dist/index.html — build ล้มเหลวหรือยังไม่รัน vite build');
  process.exit(1);
}

const publicFiles = walk(publicRoot);
const mp3InPublic = publicFiles.filter((f) => extname(f).toLowerCase() === '.mp3');
for (const src of mp3InPublic) {
  const rel = src.slice(publicRoot.length).replace(/^[/\\]/, '');
  const inDist = join(distRoot, rel);
  if (!existsSync(inDist)) {
    console.error('[verify-production-build] ไฟล์เสียง/สื่อจาก public ไม่ปรากฏใน dist:', rel);
    process.exit(1);
  }
}

if (mp3InPublic.length) {
  console.log('[verify-production-build] ตรวจ .mp3 จาก public → dist:', mp3InPublic.length, 'ไฟล์ OK');
} else {
  console.log('[verify-production-build] ไม่มี .mp3 ใน public/ (ถ้าใช้เสียง FCM บน Android ให้ใส่ใน android/app/src/.../res/raw/ แยกจาก Vite)');
}

const assetJs = walk(join(distRoot, 'assets')).filter((f) => f.endsWith('.js'));
let foundLocalhost = false;
for (const f of assetJs.slice(0, 20)) {
  const chunk = readFileSync(f, 'utf8');
  if (/localhost:\d{2,5}|127\.0\.0\.1/.test(chunk)) {
    foundLocalhost = true;
    break;
  }
}
if (foundLocalhost) {
  console.warn(
    '[verify-production-build] พบคำว่า localhost/127.0.0.1 ในบาง chunk — ตรวจสอบว่าเป็น string ตั้งใจหรือ URL API หลุดจาก dev'
  );
}

console.log('[verify-production-build] OK');
