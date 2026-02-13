/**
 * Firebase client bootstrap for the main frontend.
 *
 * IMPORTANT (security): do not hardcode secrets here.
 * This module reads Firebase web config from one of:
 * - window.__firebase_config (stringified JSON) if present
 * - localStorage key "meerak_firebase_config" (JSON string)
 * - Vite env vars: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, ...
 *
 * If no config is found, exports db/functions as null and realtime subscriptions become no-ops.
 */
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { getFunctions } from "firebase/functions";

type FirebaseWebConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

function readConfig(): FirebaseWebConfig {
  // 1) Canvas / hosting injected config
  try {
    const anyWindow = window as any;
    if (
      typeof anyWindow?.__firebase_config === "string" &&
      anyWindow.__firebase_config.trim()
    ) {
      return JSON.parse(anyWindow.__firebase_config) as FirebaseWebConfig;
    }
  } catch {
    // ignore
  }

  // 2) localStorage (dev convenience; keep out of git)
  try {
    const raw = localStorage.getItem("meerak_firebase_config");
    if (raw) return JSON.parse(raw) as FirebaseWebConfig;
  } catch {
    // ignore
  }

  // 3) Vite env
  const env = (import.meta as any).env || {};
  const cfg: FirebaseWebConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  return cfg;
}

const firebaseConfig = readConfig();
const hasConfig = !!firebaseConfig?.apiKey && !!firebaseConfig?.projectId;

let app: any = null;
let db: any = null;
let functions: any = null;

if (hasConfig) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig as any);
  db = getFirestore(app);
  functions = getFunctions(app);
} else {
  // eslint-disable-next-line no-console
  console.warn(
    "[firebase] No web config found. Set window.__firebase_config, localStorage(meerak_firebase_config), or VITE_FIREBASE_* env vars."
  );
}

export { db, functions };

type Unsub = () => void;

/**
 * Minimal realtime helpers used by MockApi.
 * These must be safe even when Firebase config is missing.
 */
const FirebaseApi = {
  subscribeToJob(jobId: string, cb: (job: any | null) => void): Unsub {
    if (!db) return () => {};
    const ref = doc(db, "jobs", jobId);
    return onSnapshot(
      ref,
      (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      () => cb(null)
    );
  },

  subscribeToMessages(jobId: string, cb: (msgs: any[]) => void): Unsub {
    if (!db) return () => {};
    const msgsRef = collection(db, "chats", jobId, "messages");
    const q = query(msgsRef, orderBy("created_at", "asc"), limit(200));
    return onSnapshot(
      q,
      (snap) => {
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      () => cb([])
    );
  },
};

export default FirebaseApi;
