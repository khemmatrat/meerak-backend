import { randomUUID } from 'crypto';

/**
 * Webhook Handler – receives and processes platform callbacks (status updates,
 * moderation results, view counts, etc.).
 *
 * Registers platform-specific handlers and dispatches incoming webhook payloads.
 * In production, route POST /api/aivos/publish/webhook/:platform here.
 */
export function createWebhookHandler(deps = {}) {
  const history = deps.history || null;
  const events = deps.events || null;

  const handlers = new Map();
  const log = [];

  /**
   * Register a handler for a specific platform.
   * @param {string} platform
   * @param {(payload: object) => Promise<void>} fn
   */
  function register(platform, fn) {
    handlers.set(platform, fn);
  }

  /**
   * Process an incoming webhook payload.
   * @param {string} platform
   * @param {object} payload  Raw webhook body
   * @returns {{ handled: boolean, record: object }}
   */
  async function process(platform, payload) {
    const record = {
      id: randomUUID(),
      platform,
      payload,
      received_at: new Date().toISOString(),
      handled: false,
      error: null,
    };
    log.push(record);

    const handler = handlers.get(platform);
    if (handler) {
      try {
        await handler(payload);
        record.handled = true;
      } catch (e) {
        record.error = e.message;
      }
    }

    if (events) {
      await events.emit({
        name: 'aivos.publish.webhook.received',
        correlationId: payload?.jobId || record.id,
        source: { agentId: 'publish', platform },
        payload: { platform, webhookId: record.id, handled: record.handled },
      }).catch(() => {});
    }

    return { handled: record.handled, record };
  }

  /** List recent webhook log entries. */
  function listLog(filter = {}) {
    if (filter.platform) return log.filter((e) => e.platform === filter.platform);
    return [...log];
  }

  return { register, process, listLog };
}

export default createWebhookHandler;
