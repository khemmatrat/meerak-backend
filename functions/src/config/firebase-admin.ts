import * as admin from 'firebase-admin';

// ตรวจสอบว่า Firebase ยังไม่ได้ initialize
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    // หรือถ้าใช้ service account file:
    // credential: admin.credential.cert(require('../service-account-key.json')),
  });
}

export { admin };