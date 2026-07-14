import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { FIREBASE_WEB_CONFIG } from './firebasePublicConfig';

const app = getApps().length ? getApp() : initializeApp(FIREBASE_WEB_CONFIG);
export const auth = getAuth(app);
export default app;
