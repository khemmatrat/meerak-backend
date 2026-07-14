export function createLayerProbe({ runtime } = {}) {
  const layers = [
    { id: 'runtime',        check: () => !!runtime?.taskRuntime },
    { id: 'kernel',         check: () => runtime?.pipeline != null },
    { id: 'pipeline',       check: () => !!runtime?.pipeline?.executor },
    { id: 'marketplace',    check: () => runtime?.marketplace?.enabled === true },
    { id: 'billing',        check: () => runtime?.billingEngine?.enabled === true },
    { id: 'governance',     check: () => runtime?.governance?.enabled === true },
    { id: 'render',         check: () => !!runtime?.pipeline?.renderEngine || !!runtime?.pipeline?.template },
    { id: 'publish',        check: () => !!runtime?.pipeline?.publishEngine },
    { id: 'analytics',      check: () => runtime?.analyticsEngine?.enabled === true },
    { id: 'learning',       check: () => runtime?.learningEngine?.enabled === true },
    { id: 'optimization',   check: () => runtime?.optimizationEngine?.enabled === true },
    { id: 'automation',     check: () => runtime?.automationEngine?.enabled === true },
    { id: 'revenue',        check: () => runtime?.revenueEngine?.enabled === true },
    { id: 'production',     check: () => typeof runtime?.observability?.startSpan === 'function' },
  ];

  return {
    probe() {
      const results = layers.map(({ id, check }) => ({ id, ok: !!check() }));
      const passCount = results.filter((r) => r.ok).length;
      return {
        ok:       passCount === results.length,
        passCount,
        total:    results.length,
        layers:   results,
        probedAt: new Date().toISOString(),
      };
    },
  };
}
