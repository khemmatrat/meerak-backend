#!/usr/bin/env node
/**
 * Growth boundary check — CI gate per Phase 20 §47.4.
 * Fails if growth/** imports forbidden platform modules.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const growthRoot = join(__dir, '../lib/aivos/growth');

const FORBIDDEN_PATTERNS = [
  { id: 'kernel', re: /from ['"][^'"]*\/kernel\// },
  { id: 'billing', re: /from ['"][^'"]*\/billing\// },
  { id: 'revenue', re: /from ['"][^'"]*\/revenue\// },
  { id: 'marketplace', re: /from ['"][^'"]*\/marketplace\// },
  { id: 'workflow', re: /from ['"][^'"]*\/workflow\// },
  { id: 'skill', re: /from ['"][^'"]*\/skill\// },
  { id: 'knowledge', re: /from ['"][^'"]*\/knowledge\// },
  { id: 'tenant_engine', re: /from ['"][^'"]*\/tenant\// },
  { id: 'integration_engine', re: /from ['"][^'"]*\.\.\/\.\.\/integration\// },
];

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
      continue;
    }
    if (name.endsWith('.js')) files.push(full);
  }
  return files;
}

const violations = [];
for (const file of walk(growthRoot)) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/^\s*import\s/.test(line) && !/from\s+['"]/.test(line)) continue;
    for (const { id, re } of FORBIDDEN_PATTERNS) {
      if (re.test(line)) {
        violations.push({ file, line: i + 1, rule: id, text: line.trim() });
      }
    }
  }
}

if (violations.length) {
  console.error('growth-boundary-check FAILED');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}:${v.line} — ${v.text}`);
  }
  process.exit(1);
}

console.log(`growth-boundary-check PASS (${walk(growthRoot).length} files scanned)`);
