#!/usr/bin/env node
/** Restore app/api/dev after production build (from .dev-api-routes-backup). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const devApi = path.join(root, 'app', 'api', 'dev');
const backup = path.join(root, '.dev-api-routes-backup');
const marker = path.join(root, '.dev-api-routes-stripped');

if (fs.existsSync(devApi)) {
  console.log('[restore-dev-api] app/api/dev already present');
  process.exit(0);
}

if (!fs.existsSync(backup)) {
  console.log('[restore-dev-api] no backup found — nothing to restore');
  process.exit(0);
}

fs.renameSync(backup, devApi);
try {
  fs.unlinkSync(marker);
} catch {
  /* ignore */
}
console.log('[restore-dev-api] restored app/api/dev');
