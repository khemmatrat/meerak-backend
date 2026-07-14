import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MAIN_THREAD_FALLBACK =
  String(process.env.REGISTRATION_BCRYPT_MAIN_THREAD || '').trim() === '1';

const WORKER_SCRIPT = join(__dirname, '..', 'workers', 'bcryptHash.worker.mjs');
const COUNT = Math.max(
  1,
  Math.min(parseInt(process.env.REGISTRATION_BCRYPT_WORKERS || '2', 10) || 2, 8),
);

let rr = 0;
let seq = 0;
/** @type {Map<number, { resolve:(h:string)=>void, reject:(e:Error)=>void }>} */
const pending = new Map();
/** @type {Worker[]} */
let pool = [];
let spawnFailedLogged = false;

function attachWorker(worker) {
  worker.on('message', (msg) => {
    if (!msg || typeof msg.id !== 'number') return;
    const waiter = pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    if (msg.ok && typeof msg.hash === 'string') waiter.resolve(msg.hash);
    else waiter.reject(new Error(msg.error || 'bcrypt_worker_failed'));
  });
  worker.on('error', (err) => {
    for (const [id] of pending) {
      const w = pending.get(id);
      if (w) {
        pending.delete(id);
        w.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
    pool = [];
  });
}

export function startupBcryptWorkerPoolSilently() {
  if (MAIN_THREAD_FALLBACK) return;
  try {
    for (let i = 0; i < COUNT; i++) {
      const w = new Worker(WORKER_SCRIPT, { env: process.env });
      attachWorker(w);
      pool.push(w);
    }
  } catch (_) {
    pool = [];
    if (!spawnFailedLogged) {
      spawnFailedLogged = true;
      console.warn(
        '[bcryptWorkerPool] Could not spawn workers — falling back to main-thread bcrypt during registration.',
      );
    }
  }
}

/**
 * Hash สำหรับเส้นทางสมัคร — async จาก worker เมื่อว่าง ไม่งั้น fallback main thread
 */
export async function bcryptHashRegistration(plain, rounds = 10) {
  if (MAIN_THREAD_FALLBACK || pool.length === 0) {
    return bcrypt.hash(String(plain), rounds);
  }
  const worker = pool[rr % pool.length];
  rr++;

  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      worker.postMessage({
        id,
        plain: String(plain),
        rounds,
      });
    } catch (e) {
      pending.delete(id);
      bcrypt
        .hash(String(plain), rounds)
        .then(resolve)
        .catch(() => reject(e instanceof Error ? e : new Error(String(e))));
    }
  });
}
