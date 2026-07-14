/**
 * Event Automation – listens to ACP runtime events and automatically
 * dispatches configured automation workflows in response.
 *
 * Bridges the Runtime event bus to the Trigger Engine.
 */
export function createEventAutomation(deps = {}) {
  const triggerEngine = deps.triggerEngine || null;
  const auditLog = deps.automationAudit || null;
  const handlers = new Map(); // eventType -> [handler]

  /**
   * Register a handler for a specific ACP event type.
   * @param {string} eventType
   * @param {Function} handler
   */
  function on(eventType, handler) {
    if (!handlers.has(eventType)) handlers.set(eventType, []);
    handlers.get(eventType).push(handler);
  }

  /**
   * Process an incoming ACP event envelope (called by Runtime).
   * @param {object} envelope
   * @returns {Promise<object[]>}
   */
  async function consume(envelope = {}) {
    if (!envelope?.type) return [];
    const results = [];

    // Direct handlers
    const list = handlers.get(envelope.type) || [];
    for (const h of list) {
      let result;
      try { result = await h(envelope); } catch (err) { result = { error: err.message }; }
      results.push({ type: envelope.type, result });
    }

    // Also forward to trigger engine
    if (triggerEngine) {
      const trigResults = await triggerEngine.processEvent(envelope);
      results.push(...trigResults.map((r) => ({ source: 'trigger', ...r })));
    }

    if (auditLog) auditLog.log({ type: 'event_automation', eventType: envelope.type, resultCount: results.length });
    return results;
  }

  return { on, consume };
}

export default createEventAutomation;
