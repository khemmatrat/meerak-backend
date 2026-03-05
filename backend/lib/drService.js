/**
 * DR Service — Disaster Recovery monitoring logic
 * Handles replication stats, standby latency, and backup metadata.
 */

import { listS3Files } from './s3-client.js';
import { readdir, stat } from 'fs/promises';
import { join, resolve } from 'path';

const PRIMARY_REGION = process.env.DR_PRIMARY_REGION || 'Asia-SE1 (Bangkok)';
const DR_REGION = process.env.DR_STANDBY_REGION || 'Asia-SE2 (Singapore)';
const STANDBY_API_URL = process.env.DR_STANDBY_API_URL || '';
const BACKUP_S3_PREFIX = process.env.DR_BACKUP_S3_PREFIX || 'backups/';
const BACKUP_LOCAL_PATH = process.env.DR_BACKUP_LOCAL_PATH || '';

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ replicationLagMs: number|null, replicationLagSeconds: number|null, replicationState: string, syncStatus: 'streaming'|'backup'|'disconnected', replicationRows: Array }>}
 */
export async function getReplicationStats(pool) {
  let replicationLagMs = null;
  let replicationLagSeconds = null;
  let replicationState = 'disconnected';
  let syncStatus = 'disconnected';
  let replicationRows = [];

  try {
    const res = await pool.query(`
      SELECT application_name, client_addr, state,
             sent_lsn, write_lsn, flush_lsn, replay_lsn,
             COALESCE(EXTRACT(EPOCH FROM replay_lag)::NUMERIC(12,4), 0) AS replay_lag_seconds,
             sync_state
      FROM pg_stat_replication
      WHERE client_addr IS NOT NULL
    `);
    replicationRows = res.rows || [];

    if (replicationRows.length > 0) {
      const r = replicationRows[0];
      replicationState = (r.state || 'unknown').toLowerCase();
      replicationLagSeconds = r.replay_lag_seconds != null ? parseFloat(r.replay_lag_seconds) : null;
      replicationLagMs = replicationLagSeconds != null ? Math.round(replicationLagSeconds * 1000) : null;

      if (replicationState === 'streaming') {
        syncStatus = 'streaming';
      } else if (replicationState === 'backup') {
        syncStatus = 'backup';
      } else {
        syncStatus = 'disconnected';
      }
    }
  } catch (_) {
    replicationState = 'unknown';
    syncStatus = 'disconnected';
  }

  return {
    replicationLagMs,
    replicationLagSeconds,
    replicationState,
    syncStatus,
    replicationRows,
  };
}

/**
 * @returns {Promise<{ latencyMs: number|null, healthy: boolean }>}
 */
export async function getStandbyLatency() {
  if (!STANDBY_API_URL) {
    return { latencyMs: null, healthy: false };
  }
  try {
    const start = Date.now();
    const r = await fetch(`${STANDBY_API_URL.replace(/\/$/, '')}/api/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - start;
    return { latencyMs, healthy: r.ok };
  } catch (_) {
    return { latencyMs: null, healthy: false };
  }
}

/**
 * @returns {Promise<{ lastBackupAt: string|null, lastBackupIso: string|null, source: string }>}
 */
export async function getLastBackupTimestamp() {
  // 1. Try S3 backups (prefix: backups/ or dr-backups/)
  try {
    const result = await listS3Files(BACKUP_S3_PREFIX, 100);
    const resources = result?.resources || [];
    if (resources.length > 0) {
      const sorted = resources
        .filter((r) => r.created_at && (r.public_id?.endsWith('.sql') || r.public_id?.endsWith('.dump') || r.public_id?.endsWith('.gz')))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const latest = sorted[0];
      if (latest?.created_at) {
        const d = new Date(latest.created_at);
        return {
          lastBackupAt: d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
          lastBackupIso: d.toISOString(),
          source: 's3',
        };
      }
    }
  } catch (_) {}

  // 2. Try local backup directory
  if (BACKUP_LOCAL_PATH) {
    try {
      const dir = resolve(BACKUP_LOCAL_PATH);
      const files = await readdir(dir);
      const sqlFiles = files.filter((f) => f.endsWith('.sql') || f.endsWith('.dump') || f.endsWith('.gz'));
      let latestMtime = 0;
      let latestFile = null;
      for (const f of sqlFiles) {
        const p = join(dir, f);
        const s = await stat(p);
        if (s.mtimeMs > latestMtime) {
          latestMtime = s.mtimeMs;
          latestFile = f;
        }
      }
      if (latestFile && latestMtime > 0) {
        const d = new Date(latestMtime);
        return {
          lastBackupAt: d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
          lastBackupIso: d.toISOString(),
          source: 'local',
        };
      }
    } catch (_) {}
  }

  return { lastBackupAt: null, lastBackupIso: null, source: 'none' };
}

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ replicationLagMs: number|null, replicationLagSeconds: number|null, replicationState: string, syncStatus: string, replicationRows: Array, standbyLatencyMs: number|null, standbyHealthy: boolean, lastBackupAt: string|null, lastBackupIso: string|null, backupSource: string }>}
 */
export async function getDrStats(pool) {
  const [repl, standby, backup] = await Promise.all([
    getReplicationStats(pool),
    getStandbyLatency(),
    getLastBackupTimestamp(),
  ]);

  return {
    ...repl,
    standbyLatencyMs: standby.latencyMs,
    standbyHealthy: standby.healthy,
    lastBackupAt: backup.lastBackupAt,
    lastBackupIso: backup.lastBackupIso,
    backupSource: backup.source,
  };
}

/**
 * @returns {{ primaryRegion: string, drRegion: string }}
 */
export function getRegionLabels() {
  return { primaryRegion: PRIMARY_REGION, drRegion: DR_REGION };
}
