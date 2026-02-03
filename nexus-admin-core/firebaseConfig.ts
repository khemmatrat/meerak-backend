// ✅ Import real Firebase from main app
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

// ✅ Real Firebase Config from Meerak
const firebaseConfig = {
  apiKey: "AIzaSyDRyGT6vYZHI5KCLBYHpjXE-aKX8Q0xE5g",
  authDomain: "meerak-b43ac.firebaseapp.com",
  projectId: "meerak-b43ac",
  storageBucket: "meerak-b43ac.firebasestorage.app",
  messagingSenderId: "724073604621",
  appId: "1:724073604621:web:ba7a15d6c7de7e6f5e8e5e"
};

let app: any = null;
let db: any = null;
let auth: any = null;
let functions: any = null;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  functions = getFunctions(app);
  console.log("✅ Firebase initialized in Nexus Admin Core");
} catch (error) {
  console.error("❌ Firebase initialization failed:", error);
}

export { app, db, auth, functions };
