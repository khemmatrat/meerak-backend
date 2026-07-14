import { createHash, timingSafeEqual } from 'crypto';
import { connectorMaxRetries } from './config.js';

function ensureWebhook(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.webhookQueue) store._tables.webhookQueue = [];
  if (!store._tables.webhookDlq) store._tables.webhookDlq = [];
  if (!store._tables.webhookReplay) store._tables.webhookReplay = new Set();
  return store._tables;
}

export function createWebhookEngine({ store, isEnabled = true, maxRetries } = {}) {
  const tables = () => ensureWebhook(store);
  const retries = maxRetries ?? connectorMaxRetries();

  function verifySignature(payload, signature, secret) {
    if (!signature || !secret) return false;
    const expected = createHash('sha256').update(`${secret}:${JSON.stringify(payload)}`).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
    } catch {
      return false;
    }
  }

  return {
    enabled: isEnabled,

    async receive({ connectorId, tenantId, payload, signature, secret, eventId } = {}) {
      if (!isEnabled) return { ok: false, reason: 'webhook_disabled' };
      const t = tables();
      if (eventId && t?.webhookReplay?.has(eventId)) {
        const err = new Error('webhook_replay_detected');
        err.code = 'WEBHOOK_REPLAY_DETECTED';
        throw err;
      }
      if (!verifySignature(payload, signature, secret)) {
        const err = new Error('webhook_signature_invalid');
        err.code = 'WEBHOOK_SIGNATURE_INVALID';
        throw err;
      }
      if (eventId) t.webhookReplay.add(eventId);
      const row = {
        connectorId,
        tenantId,
        payload,
        eventId,
        attempts: 0,
        status: 'pending',
        at: new Date().toISOString(),
      };
      t.webhookQueue.push(row);
      return { ok: true, queued: true, queueSize: t.webhookQueue.length };
    },

    async dispatch({ connectorId, tenantId, url, payload, secret } = {}) {
      const t = tables();
      const signature = createHash('sha256').update(`${secret}:${JSON.stringify(payload)}`).digest('hex');
      const row = {
        connectorId,
        tenantId,
        url,
        payload,
        signature,
        attempts: 0,
        status: 'dispatched',
        at: new Date().toISOString(),
      };
      t?.webhookQueue.push(row);
      return { ok: true, dispatched: true, signature };
    },

    async processQueue({ handler } = {}) {
      const t = tables();
      if (!t) return { processed: 0 };
      let processed = 0;
      const pending = t.webhookQueue.filter((r) => r.status === 'pending' || r.status === 'retry');
      for (const row of pending) {
        row.attempts += 1;
        try {
          if (handler) await handler(row);
          row.status = 'completed';
          processed += 1;
        } catch (e) {
          if (row.attempts >= retries) {
            row.status = 'dead_letter';
            t.webhookDlq.push({ ...row, error: e.message });
          } else {
            row.status = 'retry';
          }
        }
      }
      return { processed, dlq: t.webhookDlq.length };
    },

    recoverFromDlq({ limit = 1 } = {}) {
      const t = tables();
      const recovered = [];
      while (recovered.length < limit && t.webhookDlq.length) {
        const row = t.webhookDlq.shift();
        row.status = 'pending';
        row.attempts = 0;
        t.webhookQueue.push(row);
        recovered.push(row);
      }
      return { recovered: recovered.length, items: recovered };
    },

    dlqSize() {
      return tables()?.webhookDlq?.length || 0;
    },

    queueSize() {
      return tables()?.webhookQueue?.length || 0;
    },
  };
}
