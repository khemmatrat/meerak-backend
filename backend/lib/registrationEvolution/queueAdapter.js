/**
 * Phase 3.6 — In-process queue adapter (no consumers).
 *
 * Provides a transport-agnostic queue abstraction for signup-evolution
 * async job envelopes. This phase implements ONLY the in-memory backend.
 * No consumers, no workers, no polling, no timers, no execution.
 *
 * SAFETY CONTRACT:
 * - Synchronous only — no async/await, no Promises, no timers
 * - No job execution — envelopes are stored but never processed
 * - No persistence — memory queue is lost on process restart
 * - No external dependencies — no Redis, SQS, Kafka, pg
 * - No V1 coupling — nothing in V1 imports or references this module
 * - Never throws — every public function is wrapped in try/catch
 */

import { validateSignupJobEnvelope } from './jobEnvelope.js';

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_QUEUE_ADAPTER_VERSION = 'signup_queue_adapter_v1';

export const SIGNUP_QUEUE_BACKENDS = Object.freeze({
  MEMORY: 'memory',
  REDIS: 'redis',
  SQS: 'sqs',
  POSTGRES: 'postgres',
});

// ─── in-memory registry ────────────────────────────────────────────

/** @type {Map<string, object[]>} */
const _queues = new Map();

// ─── enqueue ───────────────────────────────────────────────────────

/**
 * Push a validated job envelope into a named in-memory queue.
 *
 * @param {string} queueName
 * @param {Record<string, unknown>} envelope
 * @returns {{ accepted: boolean, queue_name: string, queue_depth: number, reason: string }}
 */
export function enqueueSignupJob(queueName, envelope) {
  try {
    if (!queueName || typeof queueName !== 'string') {
      return { accepted: false, queue_name: '', queue_depth: 0, reason: 'invalid_queue_name' };
    }

    const validation = validateSignupJobEnvelope(envelope);
    if (!validation.valid) {
      return {
        accepted: false,
        queue_name: queueName,
        queue_depth: _queues.has(queueName) ? _queues.get(queueName).length : 0,
        reason: `invalid_envelope: ${validation.errors.join('; ')}`,
      };
    }

    if (!_queues.has(queueName)) {
      _queues.set(queueName, []);
    }

    const queue = _queues.get(queueName);
    queue.push(envelope);

    return {
      accepted: true,
      queue_name: queueName,
      queue_depth: queue.length,
      reason: 'enqueued',
    };
  } catch (_) {
    return { accepted: false, queue_name: queueName || '', queue_depth: 0, reason: 'unexpected_error' };
  }
}

// ─── inspection helpers ────────────────────────────────────────────

/**
 * Return a shallow-cloned snapshot of a single named queue.
 *
 * @param {string} queueName
 * @returns {{ queue_name: string, depth: number, envelopes: object[] } | null}
 */
export function getSignupQueueSnapshot(queueName) {
  try {
    if (!queueName || typeof queueName !== 'string') return null;
    if (!_queues.has(queueName)) return { queue_name: queueName, depth: 0, envelopes: [] };

    const queue = _queues.get(queueName);
    return {
      queue_name: queueName,
      depth: queue.length,
      envelopes: queue.map(e => ({ ...e })),
    };
  } catch (_) {
    return null;
  }
}

/**
 * Return shallow-cloned snapshots of all known queues.
 *
 * @returns {Record<string, { depth: number, envelopes: object[] }>}
 */
export function getAllSignupQueueSnapshots() {
  try {
    const result = {};
    for (const [name, queue] of _queues) {
      result[name] = {
        depth: queue.length,
        envelopes: queue.map(e => ({ ...e })),
      };
    }
    return result;
  } catch (_) {
    return {};
  }
}

/**
 * Clear all envelopes from a named queue.
 *
 * @param {string} queueName
 * @returns {{ cleared: boolean, queue_name: string, removed_count: number }}
 */
export function clearSignupQueue(queueName) {
  try {
    if (!queueName || typeof queueName !== 'string') {
      return { cleared: false, queue_name: '', removed_count: 0 };
    }
    if (!_queues.has(queueName)) {
      return { cleared: true, queue_name: queueName, removed_count: 0 };
    }

    const count = _queues.get(queueName).length;
    _queues.set(queueName, []);
    return { cleared: true, queue_name: queueName, removed_count: count };
  } catch (_) {
    return { cleared: false, queue_name: queueName || '', removed_count: 0 };
  }
}
