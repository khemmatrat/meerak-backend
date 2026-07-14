/**
 * Trigger Engine – fires automation actions when conditions are met.
 *
 * Trigger types:
 *   event   – fires when a matching ACP event arrives
 *   cron    – fires on a schedule (cron expression string)
 *   kpi     – fires when a KPI crosses a threshold
 *   manual  – fired programmatically via trigger(id)
 */
export function createTriggerEngine(deps = {}) {
  const triggers = new Map();
  const fired = [];

  /**
   * Register a trigger.
   * @param {{ id, type, condition?, event?, handler }} params
   */
  function register({ id, type = 'event', condition = null, event = null, handler }) {
    if (typeof handler !== 'function') throw new Error('trigger_handler_must_be_function');
    triggers.set(id, { id, type, condition, event, handler, enabled: true });
  }

  /**
   * Process an incoming ACP event envelope.
   * Fires all matching 'event' triggers.
   */
  async function processEvent(envelope = {}) {
    const results = [];
    for (const t of triggers.values()) {
      if (!t.enabled || t.type !== 'event') continue;
      const matches = t.event ? envelope?.type === t.event : true;
      const conditionPasses = t.condition ? t.condition(envelope) : true;
      if (matches && conditionPasses) {
        let result;
        try { result = await t.handler(envelope); } catch (err) { result = { error: err.message }; }
        fired.push({ triggerId: t.id, ts: new Date().toISOString(), envelope, result });
        results.push({ triggerId: t.id, result });
      }
    }
    return results;
  }

  /** Manually fire a trigger by ID. */
  async function fire(id, payload = {}) {
    const t = triggers.get(id);
    if (!t) throw new Error(`trigger_not_found:${id}`);
    let result;
    try { result = await t.handler(payload); } catch (err) { result = { error: err.message }; }
    fired.push({ triggerId: id, ts: new Date().toISOString(), payload, result });
    return { triggerId: id, result };
  }

  function enable(id)   { if (triggers.has(id)) triggers.get(id).enabled = true; }
  function disable(id)  { if (triggers.has(id)) triggers.get(id).enabled = false; }
  function list()       { return [...triggers.values()]; }
  function history()    { return [...fired]; }

  return { register, processEvent, fire, enable, disable, list, history };
}

export default createTriggerEngine;
