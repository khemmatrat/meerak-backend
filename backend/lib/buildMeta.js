/**
 * Non-secret build/deploy identity for GET /api/meta (release provenance, Wave 1).
 * Set at deploy: BUILD_GIT_SHA, BUILD_TIME (optional MEERAK_GIT_SHA / MEERAK_BUILD_TIME).
 */
export function getBuildMeta() {
  const gitSha =
    process.env.BUILD_GIT_SHA ||
    process.env.MEERAK_GIT_SHA ||
    process.env.GIT_COMMIT ||
    null;
  const buildTime =
    process.env.BUILD_TIME || process.env.MEERAK_BUILD_TIME || null;

  return {
    service: 'MEERAK Backend',
    version: process.env.npm_package_version || '1.0.0',
    gitSha,
    buildTime,
    nodeEnv: process.env.NODE_ENV || 'development',
    fixVersion: '2026-05-27-auth-diag',
    runtime: {
      node: process.version,
      uptimeSec: Math.floor(process.uptime()),
    },
    /** Declared auth-related routes in this release line (parity checks vs load balancers). */
    expectedAuthRoutes: [
      'POST /api/auth/login',
      'POST /api/auth/register',
      'GET /api/app/bootstrap',
      'POST /api/auth/phone-otp/send',
      'POST /api/auth/phone-otp/verify',
      'GET /api/debug/auth-check',
    ],
  };
}

/** Mount GET /api/meta (IRP-1-01) — no secrets, no login behavior change. */
export function registerBuildMetaRoute(app) {
  app.get('/api/meta', (req, res) => {
    res.json({
      ...getBuildMeta(),
      timestamp: new Date().toISOString(),
    });
  });
}
