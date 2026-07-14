/** Public Firebase web config (also embedded in public/firebase-messaging-sw.js). */

function sanitizeEnv(val: string | undefined, fallback: string): string {
  if (!val) return fallback;
  const s = String(val).replace(/["'\s,`]/g, '').trim();
  return s || fallback;
}

function extractApiKey(): string {
  const raw = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '';
  const m = String(raw).match(/AIzaSy[A-Za-z0-9_-]{32,50}/);
  return m ? m[0] : '';
}

export const FIREBASE_WEB_CONFIG = {
  apiKey: extractApiKey(),
  authDomain: sanitizeEnv(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, 'aqond-production.firebaseapp.com'),
  projectId: sanitizeEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, 'aqond-production'),
  storageBucket: sanitizeEnv(
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    'aqond-production.firebasestorage.app',
  ),
  messagingSenderId: sanitizeEnv(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, '187301416431'),
  appId: sanitizeEnv(process.env.NEXT_PUBLIC_FIREBASE_APP_ID, '1:187301416431:web:774a67a1d8554faccbfa1a'),
};

export function fcmVapidKey(): string {
  return sanitizeEnv(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY, '');
}

export function fcmWebConfigured(): boolean {
  return Boolean(FIREBASE_WEB_CONFIG.apiKey && fcmVapidKey());
}
