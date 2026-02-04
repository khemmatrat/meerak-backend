// Nexus Admin ใช้ backend admin-login (VITE_ADMIN_API_URL) — ไม่โหลด Firebase Auth เพื่อเลี่ยง 400 API key
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

const useBackendLogin =
  typeof import.meta !== "undefined" &&
  !!(import.meta as any).env?.VITE_ADMIN_API_URL;

const firebaseConfig = {
  apiKey: "AIzaSyDRyGT6vYZHI5KCLBYHpjXE-aKX8Q0xE5g",
  authDomain: "meerak-b43ac.firebaseapp.com",
  projectId: "meerak-b43ac",
  storageBucket: "meerak-b43ac.firebasestorage.app",
  messagingSenderId: "724073604621",
  appId: "1:724073604621:web:ba7a15d6c7de7e6f5e8e5e",
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
  }
  console.log(
    "✅ Firebase initialized in Nexus Admin Core" +
      (useBackendLogin ? " (Auth: backend only)" : "")
  );
} catch (error) {
  console.error("❌ Firebase initialization failed:", error);
}

export { app, db, auth, functions };
