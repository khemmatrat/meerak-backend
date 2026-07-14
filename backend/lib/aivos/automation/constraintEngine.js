/**
 * Constraint Engine – validates that a planned action does not violate
 * hard constraints (budget caps, rate limits, platform quotas, safety rules).
 *
 * Returns { allowed: bool, violations: string[] }
 */
export function createConstraintEngine(deps = {}) {
  const constraints = new Map();

  /** Register a constraint. */
  function register({ id, description, check }) {
    if (typeof check !== 'function') throw new Error('constraint_check_must_be_function');
    constraints.set(id, { id, description, check });
  }

  /**
   * Validate an action against all constraints.
   * @param {{ action, context }} params
   * @returns {{ allowed: boolean, violations: string[] }}
   */
  function validate({ action, context = {} }) {
    const violations = [];
    for (const c of constraints.values()) {
      let pass = true;
      try { pass = c.check({ action, context }); } catch (_) { pass = false; }
      if (!pass) violations.push(c.id);
    }
    return { allowed: violations.length === 0, violations };
  }

  function list()   { return [...constraints.values()]; }
  function remove(id) { constraints.delete(id); }

  return { register, validate, list, remove };
}

export default createConstraintEngine;
