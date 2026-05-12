/**
 * Business Action Registry (Task 8).
 *
 * Responsibility: Resolve `payment.purpose` to a handler through a registry.
 *
 * Handler Contract:
 *   - validate(payment, event) → { ok: boolean, failure_code?: string }
 *   - execute(client, payment, event) → Promise<{ ledger?, domainEvents?, ... }>
 *
 * CRITICAL RULES:
 *   - execute() MUST NOT call external APIs (HTTP, webhooks, notifications).
 *   - All side effects MUST be emitted as domain events (async, outside tx).
 *   - Use deterministic idempotency keys for all ledger writes.
 *
 * Edge cases:
 *   - Unknown purpose (no registry entry)              → orchestrator rejects when `purpose` is set (Phase 1A)
 *   - Missing / empty purpose                            → null handler; legacy flows may omit (orchestrator may still confirm)
 *   - Handler missing contract     → detected by orchestrator, rejected
 *   - Handler tries external calls → caught by HTTP guard (ENFORCE_NO_HTTP_IN_TX)
 *   - Duplicate execution          → idempotent via ledger.idempotency_key + partial UNIQUE(payment_id) per event_type (migration 186)
 */

import { walletTopupHandler } from './walletTopupHandler.js';
import { jobCheckoutHandler, recordEscrowReleased, resolveEscrowJobReference, isJobCompletedForEscrow } from './jobCheckoutHandler.js';
import { subscriptionHandler } from './subscriptionHandler.js';

export { recordEscrowReleased, resolveEscrowJobReference, isJobCompletedForEscrow };

// Registry: purpose → handler.
// Keys are lowercase, trimmed purpose strings.
const _registry = new Map();

/**
 * Register a handler for a specific purpose.
 * @param {string} purpose
 * @param {object} handler - must implement { validate, execute }
 */
export function registerHandler(purpose, handler) {
  const key = String(purpose || '').toLowerCase().trim();
  if (!key) throw new Error('registerHandler: purpose required');
  if (!handler || typeof handler.validate !== 'function' || typeof handler.execute !== 'function') {
    throw new Error(`registerHandler: handler for '${purpose}' must implement { validate, execute }`);
  }
  _registry.set(key, handler);
}

/**
 * Resolve a handler by purpose.
 * Returns null if no handler is registered (not an error; orchestrator will warn).
 *
 * @param {string|null} purpose
 * @returns {object|null}
 */
export function resolveHandler(purpose) {
  const key = String(purpose || '').toLowerCase().trim();
  if (!key) return null;
  return _registry.get(key) || null;
}

/**
 * Clear all registered handlers (for testing).
 */
export function clearRegistry() {
  _registry.clear();
}

/**
 * Get all registered purposes (for debugging/diagnostics).
 */
export function getRegisteredPurposes() {
  return Array.from(_registry.keys());
}

// -----------------------------------------------------------------------------
// Auto-register built-in handlers at module load.
// -----------------------------------------------------------------------------
registerHandler('wallet_topup', walletTopupHandler);
registerHandler('job_checkout', jobCheckoutHandler);
registerHandler('subscription', subscriptionHandler);

// Alias: 'wallet-topup' → 'wallet_topup' (accept both)
registerHandler('wallet-topup', walletTopupHandler);
registerHandler('job-checkout', jobCheckoutHandler);
