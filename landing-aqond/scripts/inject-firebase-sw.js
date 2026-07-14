/**
 * Injects Firebase config + VAPID key into firebase-messaging-sw at build time.
 * Run before `vite build` — Service Worker cannot use import.meta.env.
 *
 * Usage: node scripts/inject-firebase-sw.js [--debug]
 * Requires: .env with VITE_FIREBASE_* and VITE_VAPID_KEY
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const DEBUG = process.argv.includes('--debug');

// Load .env manually (Node doesn't have Vite's loadEnv)
function loadEnv() {
  const candidates = [
    path.join(root, '.env'),
    path.join(root, '.env.local'),
    path.join(root, '..', '.env'),
  ];
  let env = {};
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split(/\r?\n/).forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) return;
      const firstEq = trimmedLine.indexOf('=');
      if (firstEq !== -1) {
        const key = trimmedLine.substring(0, firstEq).trim();
        let value = trimmedLine.substring(firstEq + 1).trim();
        value = value.replace(/^["']|["']$/g, '');
        env[key] = value;
      }
    });
  }
  if (DEBUG) {
    const tried = candidates.filter((p) => fs.existsSync(p));
    console.log('🔍 Checked:', tried.join(', ') || '(none found)');
    const keys = ['VITE_FIREBASE_API_KEY', 'VITE_VAPID_KEY'];
    console.log('🔍 Loaded:', keys.map((k) => (env[k] ? `${k}=***` : `${k}=(empty)`)).join(', '));
  }
  return env;
}

const env = loadEnv();
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || '',
};
const vapidKey = env.VITE_VAPID_KEY || '';

const templatePath = path.join(root, 'public', 'firebase-messaging-sw.template.js');
const outputPath = path.join(root, 'public', 'firebase-messaging-sw.js');

if (!fs.existsSync(templatePath)) {
  console.error('❌ firebase-messaging-sw.template.js not found in public/');
  process.exit(1);
}

let sw = fs.readFileSync(templatePath, 'utf-8');
sw = sw.replace('__FIREBASE_CONFIG__', JSON.stringify(config, null, 2));
sw = sw.replace('__VAPID_KEY__', JSON.stringify(vapidKey));

fs.writeFileSync(outputPath, sw);
console.log('✅ firebase-messaging-sw.js generated');
if (!config.apiKey || !vapidKey) {
  console.warn('⚠️  Missing VITE_FIREBASE_API_KEY or VITE_VAPID_KEY — push may not work');
  console.warn('   Run with --debug to see what was loaded. Ensure .env is in', root);
}
