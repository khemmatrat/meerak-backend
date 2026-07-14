export function isOptimizationEnabled() {
  return process.env.AIVOS_OPTIMIZATION_ENABLED === '1' || process.env.AIVOS_OPTIMIZATION_ENABLED === 'true';
}

export function assertOptimizationEnabled() {
  if (!isOptimizationEnabled()) {
    const err = new Error('aivos_optimization_disabled');
    err.code = 'AIVOS_OPTIMIZATION_DISABLED';
    throw err;
  }
}

/** Auto-apply safe tuning recommendations without human review. Default: OFF. */
export function isAutoTuneEnabled() {
  return process.env.AIVOS_OPT_AUTO_TUNE === '1' || process.env.AIVOS_OPT_AUTO_TUNE === 'true';
}

/** Safety threshold: only auto-apply if confidence >= this value. */
export function autoTuneConfidenceThreshold() {
  return parseFloat(process.env.AIVOS_OPT_CONFIDENCE_THRESHOLD || '0.75');
}
