import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// ดึงเฉพาะ AIzaSy... (ตัด quotes, comma, whitespace ทุกชนิด)
function extractApiKey(): string {
  const raw = (import.meta as any).env?.VITE_FIREBASE_API_KEY ?? '';
  const m = String(raw).match(/AIzaSy[A-Za-z0-9_-]{32,50}/);
  const key = m ? m[0] : '';
  if (!key) console.warn('[Firebase] VITE_FIREBASE_API_KEY ใน .env ต้องเป็น AIzaSy... จาก Firebase Console');
  return key;
}

function sanitizeEnv(val: string | undefined, fallback: string): string {
  if (!val) return fallback;
  const s = String(val).replace(/["'\s,`]/g, '').trim();
  return s || fallback;
}

// Firebase configuration
// ⚠️ ใน .env (root): VITE_FIREBASE_API_KEY=AIzaSy... (ไม่มี quotes รอบค่า)
const firebaseConfig = {
  apiKey: extractApiKey(),
  authDomain: sanitizeEnv((import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN, "aqond-production.firebaseapp.com"),
  projectId: sanitizeEnv((import.meta as any).env?.VITE_FIREBASE_PROJECT_ID, "aqond-production"),
  storageBucket: sanitizeEnv((import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET, "aqond-production.firebasestorage.app"),
  messagingSenderId: sanitizeEnv((import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID, "187301416431"),
  appId: sanitizeEnv((import.meta as any).env?.VITE_FIREBASE_APP_ID, "1:187301416431:web:774a67a1d8554faccbfa1a")
};

// Initialize Firebase (หลีกเลี่ยง duplicate-app เมื่อ HMR หรือ import ซ้ำ)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Authentication
export const auth = getAuth(app);

export default app;
