/**
 * Remove backend/dist before tsc emit. Windows EPERM during `npm run build` often happens when
 * dist output files carry the Read-only attribute (archives/copies/Git/some tooling); overwriting
 * them fails though creating new files in dist may succeed.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

try {
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
    console.error('[clean-dist] removed:', distDir);
  }
} catch (e) {
  console.error('[clean-dist] failed:', e?.message || e);
  process.exitCode = 1;
}
