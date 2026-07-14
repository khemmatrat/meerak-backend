/**
 * Rule Engine – evaluate IF/THEN automation rules against a context object.
 *
 * Rule shape: { id, name, condition: (ctx) => bool, action: string, params: object, priority, enabled }
 * Returns matched rules sorted by priority (highest first).
 */
export function createRuleEngine(deps = {}) {
  const rules = new Map();

  /** Register a rule. */
  function register({ id, name, condition, action, params = {}, priority = 10, enabled = true }) {
    if (typeof condition !== 'function') throw new Error('rule_condition_must_be_function');
    rules.set(id, { id, name, condition, action, params, priority, enabled });
  }

  /** Evaluate all enabled rules against ctx; return matched actions. */
  function evaluate(ctx = {}) {
    const matched = [];
    for (const rule of rules.values()) {
      if (!rule.enabled) continue;
      let result = false;
      try { result = rule.condition(ctx); } catch (_) { /* swallow */ }
      if (result) matched.push({ ruleId: rule.id, name: rule.name, action: rule.action, params: rule.params, priority: rule.priority });
    }
    return matched.sort((a, b) => b.priority - a.priority);
  }

  function enable(id)  { if (rules.has(id)) rules.get(id).enabled = true; }
  function disable(id) { if (rules.has(id)) rules.get(id).enabled = false; }
  function list()      { return [...rules.values()]; }
  function remove(id)  { rules.delete(id); }

  return { register, evaluate, enable, disable, list, remove };
}

export default createRuleEngine;
