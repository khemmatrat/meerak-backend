/**
 * บิลด์โปรดักชัน + คัดลอกเข้า Android สำหรับทดสอบก่อนขึ้น Play Store (internal / closed / production)
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mobileRoot = join(__dirname, '..');
const androidDir = join(mobileRoot, 'android');

function run(cmd) {
   execSync(cmd, { cwd: mobileRoot, stdio: 'inherit', shell: true });
}

if (!existsSync(androidDir)) {
   console.error('[android-pre-release] ไม่พบโฟลเดอร์ android/ — รัน npx cap add android จากโฟลเดอร์ mobile ก่อน');
   process.exit(1);
}

console.log('[android-pre-release] 1/3 ตรวจสอบ env + บิลด์ Vite (production)...\n');
run('npm run build:production');

console.log('\n[android-pre-release] 2/3 คัดลอก web asset → android (cap copy)...\n');
run('npx cap copy');

console.log(`
[android-pre-release] 3/3 เสร็จแล้ว — ขั้นต่อไป (ทำตามลำดับจนผ่านทุกด่าน):

  A) เปิดโปรเจกต์ Android
     cd mobile && npx cap open android

  B) ใน Android Studio: Build → Generate Signed Bundle / APK
     — ใช้ keystore release (เก็บรหัสผ่านปลอดภัย)
     — บันทึก SHA-256 ของ signing key ไปใส่ Firebase Console → Project settings → Your apps → Android

  C) Play Console
     — อัปโหลด AAB ไปที่ Internal testing ก่อน (ทีมทดสอบภายใน)
     — ทดสอบ: ติดตั้งจากลิงก์ internal, Login (OTP + รหัสผ่าน), flow หลัก
     — ผ่านแล้วค่อยย้ายไป Closed testing → Open testing → Production

  D) ถ้า Play แจ้ง "already installed" / ติดตั้งซ้ำไม่ได้
     — ถอนแอปเก่าหรือเพิ่ม versionCode ใน android/app/build.gradle

  E) API / เครือข่าย
     — APK ที่ build ด้วยค่าใน .env.production จะยิง API ตาม VITE_BACKEND_URL (ต้องเป็น https สำหรับทดสอบภายนอก)
`);
