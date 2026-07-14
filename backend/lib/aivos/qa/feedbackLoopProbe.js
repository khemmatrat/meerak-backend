export function createFeedbackLoopProbe({ runtime } = {}) {
  return {
    probe() {
      const learning  = runtime?.learningEngine;
      const analytics = runtime?.analyticsEngine;
      const steps = [
        { step: 'analytics',   ok: analytics?.enabled === true && typeof analytics?.collector?.trackImpression === 'function' },
        { step: 'learning',    ok: learning?.enabled === true && typeof learning?.ingestPublishedJob === 'function' },
        { step: 'feedback',    ok: learning?.enabled === true && typeof learning?.feedback?.processPending === 'function' },
        { step: 'governance',  ok: runtime?.governance?.enabled === true && typeof runtime?.governance?.auditVersionChange === 'function' },
        { step: 'optimization', ok: runtime?.optimizationEngine?.enabled === true && typeof runtime?.optimizationEngine?.runCycle === 'function' },
      ];
      const passCount = steps.filter((s) => s.ok).length;
      return {
        closed:   passCount === steps.length,
        passCount,
        total:    steps.length,
        steps,
        probedAt: new Date().toISOString(),
      };
    },
  };
}
