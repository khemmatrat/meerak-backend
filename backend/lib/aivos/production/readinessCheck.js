import { PRODUCTION_PHASE } from './config.js';

export function createReadinessCheck({ runtime } = {}) {
  return {
    check() {
      const checks = [
        { name: 'runtime',       ok: !!runtime?.taskRuntime },
        { name: 'observability', ok: typeof runtime?.observability?.startSpan === 'function' },
        { name: 'costDashboard', ok: typeof runtime?.costDashboard?.getSummary === 'function' },
        { name: 'analytics',     ok: runtime?.analyticsEngine !== undefined },
        { name: 'learning',      ok: runtime?.learningEngine !== undefined },
        { name: 'optimization',  ok: runtime?.optimizationEngine !== undefined },
        { name: 'automation',    ok: runtime?.automationEngine !== undefined },
        { name: 'revenue',       ok: runtime?.revenueEngine !== undefined },
        { name: 'pipeline',      ok: !!runtime?.pipeline },
        { name: 'events',        ok: typeof runtime?.events?.emit === 'function' },
      ];
      const ok = checks.every((c) => c.ok);
      return { ok, phase: PRODUCTION_PHASE, checks, at: new Date().toISOString() };
    },
  };
}
