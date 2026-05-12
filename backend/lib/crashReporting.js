/**
 * Process-level crash hooks + optional Sentry when SENTRY_DSN and @sentry/node are available.
 */
import { logError } from './logger.js';

let sentryCapture = /** @type {((e: Error) => void) | null} */ (null);

/**
 * Call once after dotenv loads (e.g. from server.js).
 */
export function initCrashReporting() {
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(typeof reason === 'string' ? reason : JSON.stringify(reason));
    logError(err, { type: 'unhandledRejection' });
    console.error('[unhandledRejection]', err.stack || err.message);
    if (sentryCapture) sentryCapture(err);
  });

  process.on('uncaughtException', (err) => {
    const e = err instanceof Error ? err : new Error(String(err));
    logError(e, { type: 'uncaughtException' });
    console.error('[uncaughtException]', err?.stack || err);
    if (sentryCapture) sentryCapture(e);
  });

  const dsn = (process.env.SENTRY_DSN || '').trim();
  if (!dsn) return;

  import('@sentry/node')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV || 'development',
        tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0') || 0,
      });
      sentryCapture = (e) => {
        Sentry.captureException(e);
      };
      console.log('[crashReporting] Sentry initialized');
    })
    .catch(() => {
      console.warn('[crashReporting] SENTRY_DSN set but @sentry/node failed to load');
    });
}
