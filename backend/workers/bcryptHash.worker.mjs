/**
 * bcrypt ใน Worker — ไม่ให้รอบ hash ในการสมัครบล็อก event loop หลัก
 */
import { parentPort } from 'node:worker_threads';
import bcrypt from 'bcryptjs';

parentPort.on('message', async (msg) => {
  const { id, plain, rounds } = msg || {};
  if (!id || typeof plain !== 'string') {
    parentPort.postMessage({ id: id || 0, ok: false, error: 'invalid_message' });
    return;
  }
  try {
    const hash = await bcrypt.hash(plain, typeof rounds === 'number' ? rounds : 10);
    parentPort.postMessage({ id, ok: true, hash });
  } catch (e) {
    parentPort.postMessage({
      id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});
