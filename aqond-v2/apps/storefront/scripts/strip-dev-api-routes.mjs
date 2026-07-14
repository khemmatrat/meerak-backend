#!/usr/bin/env node
/**
 * Remove app/api/dev from the tree before production `next build`.
 * Dev routes are NOT mounted via runtime flags — they are absent from the build input.
 *
 * Set AQOND_INCLUDE_DEV_API=1 to skip stripping (local prod-like experiments only).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const devApi = path.join(root, 'app', 'api', 'dev');
const backup = path.join(root, '.dev-api-routes-backup');
const marker = path.join(root, '.dev-api-routes-stripped');

if (process.env.AQOND_INCLUDE_DEV_API === '1') {
  console.log('[strip-dev-api] AQOND_INCLUDE_DEV_API=1 — keeping app/api/dev');
  process.exit(0);
}

if (!fs.existsSync(devApi)) {
  if (fs.existsSync(marker)) {
    console.log('[strip-dev-api] already stripped');
  } else {
    console.log('[strip-dev-api] app/api/dev not present — nothing to do');
  }
  process.exit(0);
}

fs.rmSync(backup, { recursive: true, force: true });
try {
  fs.renameSync(devApi, backup);
} catch {
  fs.cpSync(devApi, backup, { recursive: true });
  fs.rmSync(devApi, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
fs.writeFileSync(marker, new Date().toISOString(), 'utf8');
console.log('[strip-dev-api] moved app/api/dev → .dev-api-routes-backup');
