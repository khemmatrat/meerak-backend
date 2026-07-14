import { createReadinessCheck } from './readinessCheck.js';
import { createAlertRules } from './alertRules.js';
import { generateOpenApiSpec } from './openapi.js';
import { getProductionChecklist } from './checklist.js';

export { isProductionModeEnabled, PRODUCTION_PHASE, ALERT_THRESHOLDS } from './config.js';
export { createReadinessCheck } from './readinessCheck.js';
export { createAlertRules } from './alertRules.js';
export { generateOpenApiSpec } from './openapi.js';
export { getProductionChecklist } from './checklist.js';

export function createProductionModule({ runtime } = {}) {
  const readiness = createReadinessCheck({ runtime });
  const alerts    = createAlertRules();
  return {
    readiness,
    alerts,
    getChecklist: getProductionChecklist,
    getOpenApi:   generateOpenApiSpec,
  };
}
