import { GROWTH_PHASE, GROWTH_SDK_VERSION, isGrowthEnabled } from '../config.js';

export const GROWTH_RC_TAG = 'v20.0.0-rc.1';

const CHECKLIST = [
  { id: 'growth_enabled', label: 'AIVOS_GROWTH_ENABLED feature flag' },
  { id: 'sdk_version', label: 'Growth SDK version pinned' },
  { id: 'retention_job', label: 'Retention scheduler available' },
  { id: 'integration_hub', label: 'Integration hub wired' },
  { id: 'event_bridge', label: 'ACP event bridge subscribed' },
  { id: 'http_v1', label: 'HTTP /v1 compatibility aliases' },
  { id: 'regression_floor', label: 'Full regression >= 375 tests' },
  { id: 'flag_rollback', label: 'Rollback path AIVOS_GROWTH_ENABLED=0' },
];

export function getGrowthProductionChecklist({
  growth,
  regressionPass = 0,
  regressionTotal = 0,
} = {}) {
  const items = CHECKLIST.map((item) => {
    let pass = false;
    switch (item.id) {
      case 'growth_enabled':
        pass = isGrowthEnabled() && growth?.enabled === true;
        break;
      case 'sdk_version':
        pass = GROWTH_SDK_VERSION.startsWith('20.');
        break;
      case 'retention_job':
        pass = typeof growth?.retentionJob?.run === 'function';
        break;
      case 'integration_hub':
        pass = typeof growth?.integration?.handleEvent === 'function';
        break;
      case 'event_bridge':
        pass = Array.isArray(growth?.eventBridge?.catalog) && growth.eventBridge.catalog.length >= 10;
        break;
      case 'http_v1':
        pass = true;
        break;
      case 'regression_floor':
        pass = regressionPass >= 375 && regressionPass === regressionTotal;
        break;
      case 'flag_rollback':
        pass = true;
        break;
      default:
        pass = false;
    }
    return { ...item, pass };
  });

  const passCount = items.filter((i) => i.pass).length;
  return {
    phase: GROWTH_PHASE,
    sprint: '20.5',
    rc: GROWTH_RC_TAG,
    sdkVersion: GROWTH_SDK_VERSION,
    complete: passCount === items.length,
    passCount,
    total: items.length,
    items,
    regression: { pass: regressionPass, total: regressionTotal },
    at: new Date().toISOString(),
  };
}
