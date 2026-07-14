import { spawnSync } from 'child_process';
import path from 'path';

function backendRoot(): string {
  return path.resolve(process.cwd(), '../../../backend');
}

function runDirectorCli<T>(cmd: 'plan' | 'run', body: Record<string, unknown>): T | null {
  const script = path.join(backendRoot(), 'scripts', 'director-cli.mjs');
  const payload = JSON.stringify(body);
  const res = spawnSync(process.execPath, [script, cmd, payload], {
    cwd: backendRoot(),
    env: {
      ...process.env,
      AIVOS_RUNTIME_ENABLED: process.env.AIVOS_RUNTIME_ENABLED || '1',
      AIVOS_MERCHANT_AD_ENABLED: process.env.AIVOS_MERCHANT_AD_ENABLED || '1',
      AIVOS_MERCHANT_AD_MOCK_UGC: process.env.AIVOS_MERCHANT_AD_MOCK_UGC || '1',
    },
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: cmd === 'run' ? 120_000 : 30_000,
  });
  const out = (res.stdout || '').trim();
  const err = (res.stderr || '').trim();
  if (res.status !== 0) {
    try {
      const parsed = JSON.parse(err || out);
      throw new Error(parsed.error || 'director_cli_failed');
    } catch {
      return null;
    }
  }
  if (!out) return null;
  try {
    return JSON.parse(out) as T;
  } catch {
    return null;
  }
}

export function localDirectorEnabled(): boolean {
  return (
    process.env.AQOND_LOCAL_DEV === '1' ||
    process.env.NEXT_PUBLIC_AQOND_LOCAL_DEV === '1' ||
    process.env.NODE_ENV === 'development'
  );
}

export function tryLocalDirectorPlan(body: Record<string, unknown>) {
  if (!localDirectorEnabled()) return null;
  return runDirectorCli<Record<string, unknown>>('plan', body);
}

export function tryLocalDirectorRun(body: Record<string, unknown>) {
  if (!localDirectorEnabled()) return null;
  return runDirectorCli<Record<string, unknown>>('run', body);
}
