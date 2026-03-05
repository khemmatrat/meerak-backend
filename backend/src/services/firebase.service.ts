// backend/src/services/firebase.service.ts
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin SDK
let firebaseApp: admin.app.App;

try {
  // ใช้ service account จาก environment variables หรือ service account file
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // ถ้ามี JSON string ใน env
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });
  } else if (process.env.FIREBASE_PROJECT_ID) {
    // ใช้ environment variables แยก
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } else {
    // Fallback: ใช้ default credentials (สำหรับ Firebase Functions หรือ GCP)
    firebaseApp = admin.initializeApp();
  }
  
  console.log('✅ Firebase Admin SDK initialized');
} catch (error) {
  console.error('❌ Firebase Admin SDK initialization failed:', error);
  // สร้าง mock app สำหรับ development
  firebaseApp = admin.initializeApp({
    projectId: 'meerak-dev',
  });
}

export const firebaseAdmin = admin;
export const firebaseAuth = admin.auth();

/**
 * Verify Firebase ID Token
 */
export async function verifyFirebaseToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
  try {
    const decodedToken = await firebaseAuth.verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    throw new Error(`Invalid Firebase token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get user by Firebase UID
 */
export async function getFirebaseUser(uid: string): Promise<admin.auth.UserRecord> {
  try {
    return await firebaseAuth.getUser(uid);
  } catch (error) {
    throw new Error(`Firebase user not found: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create custom token (สำหรับ server-side authentication)
 */
export async function createCustomToken(uid: string, additionalClaims?: object): Promise<string> {
  try {
    return await firebaseAuth.createCustomToken(uid, additionalClaims);
  } catch (error) {
    throw new Error(`Failed to create custom token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Set custom user claims (สำหรับ role-based access)
 */
export async function setCustomClaims(uid: string, claims: { role?: string; [key: string]: any }): Promise<void> {
  try {
    await firebaseAuth.setCustomUserClaims(uid, claims);
  } catch (error) {
    throw new Error(`Failed to set custom claims: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete user from Firebase
 */
export async function deleteFirebaseUser(uid: string): Promise<void> {
  try {
    await firebaseAuth.deleteUser(uid);
  } catch (error) {
    throw new Error(`Failed to delete Firebase user: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export default firebaseAdmin;
