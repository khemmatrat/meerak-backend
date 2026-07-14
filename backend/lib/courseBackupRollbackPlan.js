/**
 * Phase 20 — Backup & rollback plan verification (dry-run, no destructive restore).
 */
import { existsSync, mkdirSync, readFileSync, statSync, readdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = join(__dirname, '..');
const REPO_ROOT = join(BACKEND_ROOT, '..');

export const BACKUP_ROLLBACK_CHECKS = [
  { id: 'deploy_script_backup', label: 'Deploy script สร้าง DB backup ก่อน migrate' },
  { id: 'rollback_docs', label: 'Rollback instructions ใน COURSE_MARKETPLACE_DEPLOY.txt' },
  { id: 'backup_dir', label: 'Backup directory พร้อมใช้งาน' },
  { id: 'pg_dump_available', label: 'pg_dump / docker postgres พร้อม backup' },
  { id: 'migration_runner', label: 'Migration runner script มีอยู่' },
  { id: 'compose_deploy', label: 'Docker compose deploy script มีอยู่' },
  { id: 'recent_backup_or_dry_run', label: 'มี backup ล่าสุด หรือ dry-run pg_dump สำเร็จ' },
];

function readText(relFromBackend) {
  const p = join(BACKEND_ROOT, relFromBackend);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

function checkDeployScriptBackup() {
  const sh = readText('scripts/run-course-marketplace-on-server.sh');
  const ps1 = existsSync(join(REPO_ROOT, 'scripts', 'deploy-course-marketplace-production.ps1'))
    ? readFileSync(join(REPO_ROOT, 'scripts', 'deploy-course-marketplace-production.ps1'), 'utf8')
    : '';
  const ok =
    sh.includes('pg_dump') &&
    sh.includes('pre_course_marketplace_') &&
    sh.includes('BACKUP_DIR');
  return {
    ok,
    hasPgDump: sh.includes('pg_dump'),
    hasBackupDir: sh.includes('BACKUP_DIR'),
    deployPs1Exists: ps1.length > 0,
  };
}

function checkRollbackDocs() {
  const doc = readText('COURSE_MARKETPLACE_DEPLOY.txt');
  const ok =
    /Rollback|rollback/i.test(doc) &&
    doc.includes('gunzip') &&
    doc.includes('pre_course_marketplace_');
  return {
    ok,
    hasGunzipRestore: doc.includes('gunzip'),
    hasSoftRollback: /Soft rollback/i.test(doc),
  };
}

function resolveBackupDir() {
  const appsDir = process.env.AQOND_APPS_DIR || process.env.APPS_DIR;
  if (appsDir && existsSync(appsDir)) {
    return join(appsDir, 'backups');
  }
  const local = join(BACKEND_ROOT, 'backups');
  return local;
}

function ensureBackupDir(dir) {
  try {
    mkdirSync(dir, { recursive: true });
    return { ok: true, path: dir };
  } catch (e) {
    return { ok: false, path: dir, error: e?.message };
  }
}

function findRecentBackup(backupDir, maxAgeHours = 168) {
  if (!existsSync(backupDir)) return null;
  let best = null;
  for (const name of readdirSync(backupDir)) {
    if (!name.startsWith('pre_course_marketplace_') || !name.endsWith('.sql.gz')) continue;
    const full = join(backupDir, name);
    try {
      const mtime = statSync(full).mtimeMs;
      const ageHours = (Date.now() - mtime) / 3600000;
      if (ageHours <= maxAgeHours && (!best || mtime > best.mtime)) {
        best = { name, path: full, mtime, ageHours: Math.round(ageHours * 10) / 10 };
      }
    } catch {
      /* skip */
    }
  }
  return best;
}

function tryPgDumpDryRun() {
  const docker = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' });
  if (docker.status === 0 && (docker.stdout || '').includes('aqond-postgres')) {
    const dump = spawnSync(
      'docker',
      ['exec', 'aqond-postgres', 'pg_dump', '-U', 'meera', '--schema-only', 'meera_db'],
      { encoding: 'utf8', timeout: 30000 },
    );
    if (dump.status === 0 && (dump.stdout || '').includes('CREATE TABLE')) {
      return { ok: true, mode: 'docker_aqond-postgres', tablesHint: true };
    }
    return { ok: false, mode: 'docker_aqond-postgres', error: dump.stderr?.slice(0, 200) };
  }

  const local = spawnSync('pg_dump', ['--version'], { encoding: 'utf8' });
  if (local.status === 0) {
    return { ok: true, mode: 'pg_dump_cli', version: (local.stdout || local.stderr || '').trim() };
  }

  return { ok: false, mode: 'none', hint: 'install pg_dump or run aqond-postgres container' };
}

/**
 * @param {{ backupDir?: string, createLocalBackup?: boolean }} [opts]
 */
export async function verifyCourseBackupRollbackPlan(opts = {}) {
  const backupDir = opts.backupDir || resolveBackupDir();
  const results = [];

  const deployBackup = checkDeployScriptBackup();
  results.push({
    id: 'deploy_script_backup',
    label: 'Deploy script สร้าง DB backup ก่อน migrate',
    pass: deployBackup.ok,
    detail: deployBackup,
  });

  const rollbackDocs = checkRollbackDocs();
  results.push({
    id: 'rollback_docs',
    label: 'Rollback instructions ใน COURSE_MARKETPLACE_DEPLOY.txt',
    pass: rollbackDocs.ok,
    detail: rollbackDocs,
  });

  const dirReady = ensureBackupDir(backupDir);
  results.push({
    id: 'backup_dir',
    label: 'Backup directory พร้อมใช้งาน',
    pass: dirReady.ok,
    detail: dirReady,
  });

  const pgDump = tryPgDumpDryRun();
  results.push({
    id: 'pg_dump_available',
    label: 'pg_dump / docker postgres พร้อม backup',
    pass: pgDump.ok,
    detail: pgDump,
  });

  const migrationOk = existsSync(join(BACKEND_ROOT, 'scripts', 'run-migration.js'));
  results.push({
    id: 'migration_runner',
    label: 'Migration runner script มีอยู่',
    pass: migrationOk,
    detail: { path: 'scripts/run-migration.js' },
  });

  const composeOk = existsSync(join(BACKEND_ROOT, 'scripts', 'run-course-marketplace-on-server.sh'));
  results.push({
    id: 'compose_deploy',
    label: 'Docker compose deploy script มีอยู่',
    pass: composeOk,
    detail: { path: 'scripts/run-course-marketplace-on-server.sh' },
  });

  let recent = findRecentBackup(backupDir);
  let dryRunOk = pgDump.ok;

  if (!recent && opts.createLocalBackup && pgDump.ok && dockerHasPostgres()) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outFile = join(backupDir, `pre_course_marketplace_${stamp}.sql.gz`);
    const created = createDockerBackup(outFile);
    if (created.ok) {
      recent = findRecentBackup(backupDir);
    }
    dryRunOk = created.ok || dryRunOk;
  }

  results.push({
    id: 'recent_backup_or_dry_run',
    label: 'มี backup ล่าสุด หรือ dry-run pg_dump สำเร็จ',
    pass: !!recent || dryRunOk,
    detail: {
      recentBackup: recent,
      dryRun: pgDump,
      backupDir,
    },
  });

  const passCount = results.filter((r) => r.pass).length;
  return {
    pass: results.every((r) => r.pass),
    passCount,
    total: results.length,
    backupDir,
    checks: results,
    rollbackSteps: [
      '1. Stop traffic / maintenance notice if needed',
      '2. gunzip -c backups/pre_course_marketplace_*.sql.gz | docker exec -i aqond-postgres psql -U meera meera_db',
      '3. Redeploy previous backend-1.2 snapshot',
      '4. docker compose -f docker-compose.golive.v12.yml up -d --force-recreate backend mobile admin',
    ],
    generatedAt: new Date().toISOString(),
  };
}

function dockerHasPostgres() {
  const docker = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' });
  return docker.status === 0 && (docker.stdout || '').includes('aqond-postgres');
}

function createDockerBackup(outFile) {
  try {
    const dump = spawnSync(
      'docker',
      ['exec', 'aqond-postgres', 'pg_dump', '-U', 'meera', 'meera_db'],
      { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024, timeout: 120000 },
    );
    if (dump.status !== 0) {
      return { ok: false, error: dump.stderr?.toString()?.slice(0, 200) };
    }
    writeFileSync(outFile, gzipSync(dump.stdout));
    return { ok: true, path: outFile, bytes: statSync(outFile).size };
  } catch (e) {
    return { ok: false, error: e?.message };
  }
}
