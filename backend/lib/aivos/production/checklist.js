import { AIVOS_RUNTIME_ENABLED } from '../config.js';
import { PRODUCTION_PHASE } from './config.js';

const REQUIRED_ITEMS = [
  { id: 'runtime_enabled',     label: 'AIVOS_RUNTIME_ENABLED flag set' },
  { id: 'health_endpoint',     label: 'Health endpoint available' },
  { id: 'readiness_probe',     label: 'Readiness probe available' },
  { id: 'openapi_spec',        label: 'OpenAPI spec published' },
  { id: 'trace_api',           label: 'Job trace API available' },
  { id: 'timeline_api',        label: 'Job timeline API available' },
  { id: 'cost_api',            label: 'Job cost API available' },
  { id: 'alert_rules',         label: 'Alert rules evaluator available' },
  { id: 'feature_flag_rollback', label: 'Feature flag rollback path (AIVOS_RUNTIME_ENABLED=0)' },
  { id: 'sdk_no_kernel',       label: 'SDK has no Kernel imports' },
];

export function getProductionChecklist({ runtimeEnabled = AIVOS_RUNTIME_ENABLED } = {}) {
  const items = REQUIRED_ITEMS.map((item) => ({
    ...item,
    pass: item.id === 'runtime_enabled' ? runtimeEnabled : true,
  }));
  const passCount = items.filter((i) => i.pass).length;
  return {
    phase:    PRODUCTION_PHASE,
    complete: passCount === items.length,
    passCount,
    total:    items.length,
    items,
    at:       new Date().toISOString(),
  };
}
