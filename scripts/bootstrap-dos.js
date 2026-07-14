#!/usr/bin/env node
/** Bootstrap AQOND Documentation Operating System files. Run: node scripts/bootstrap-dos.cjs */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const cjs = path.join(path.dirname(fileURLToPath(import.meta.url)), 'bootstrap-dos.cjs');
const r = spawnSync(process.execPath, [cjs], { stdio: 'inherit' });
process.exit(r.status ?? 1);
