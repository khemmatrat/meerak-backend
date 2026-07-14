import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { isGrokVideoEnabled, grokMaxShots, merchantAdAspectRatio } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_ROOT = path.resolve(__dirname, '../../../../aqond-brain');
const SHOT_SCRIPT = path.join(BRAIN_ROOT, 'scripts', 'merchant_ad_shot.py');

const GROK_TIMEOUT_MS = Number(process.env.AIVOS_MERCHANT_AD_GROK_TIMEOUT_MS || 240000);

export function hasGrokCredentials() {
  if (process.env.AIVOS_MERCHANT_AD_MOCK_GROK === '1') return false;
  return Boolean(String(process.env.XAI_API_KEY || '').trim());
}

export function shouldUseGrokForShot(shotIndex) {
  if (!isGrokVideoEnabled() || !hasGrokCredentials()) return false;
  return shotIndex < grokMaxShots();
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sprint 4 — spawn aqond-brain merchant_ad_shot.py (Grok image-to-video).
 * Returns output path on success, null on failure (caller falls back to Ken Burns).
 */
export async function generateShotClipViaGrok({ prompt, imagePath, durationSec, outPath }) {
  if (!isGrokVideoEnabled() || !hasGrokCredentials()) return null;
  if (!(await fileExists(SHOT_SCRIPT))) return null;
  if (!(await fileExists(imagePath))) return null;

  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const py = process.platform === 'win32' ? 'python' : 'python3';
  const args = [
    SHOT_SCRIPT,
    '--prompt',
    prompt,
    '--image',
    imagePath,
    '--duration',
    String(durationSec),
    '--out',
    outPath,
    '--aspect',
    merchantAdAspectRatio(),
  ];

  return new Promise((resolve) => {
    const child = spawn(py, args, {
      cwd: BRAIN_ROOT,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve(null);
    }, GROK_TIMEOUT_MS);

    child.on('close', async (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve(null);
        return;
      }
      try {
        const line = stdout.trim().split('\n').filter(Boolean).pop() || '';
        const data = JSON.parse(line);
        if (data.ok && (await fileExists(outPath))) {
          resolve(outPath);
          return;
        }
      } catch {
        /* fall through */
      }
      resolve(null);
    });

    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}
