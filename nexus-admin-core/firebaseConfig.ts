// ✅ Nexus Admin: use backend JWT when VITE_ADMIN_API_URL is set (no Firebase Auth iframe).
// Firestore (db) is always initialized so User Management can list users from the app (Firebase).
// Only Auth/Functions are skipped when using backend login to avoid "API key not valid" from Identity Toolkit.
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

const useBackendLogin =
  typeof import.meta !== "undefined" &&
  !!(import.meta as any).env?.VITE_ADMIN_API_URL;

const env = typeof import.meta !== "undefined" ? (import.meta as any).env : {};
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: env.VITE_FIREBASE_APP_ID || "",
};

let app: any = null;
let db: any = null;
let auth: any = null;
let functions: any = null;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  if (!useBackendLogin) {
    auth = getAuth(app);
    functions = getFunctions(app);
    console.log(
      "✅ Firebase (App + Firestore + Auth) initialized in Nexus Admin Core"
    );
  } else {
    console.log(
      "✅ Nexus Admin: backend login — Firestore (db) enabled for User Management, Auth skipped"
    );
  }
} catch (error) {
  console.error("❌ Firebase initialization failed:", error);
}

export { app, db, auth, functions };
