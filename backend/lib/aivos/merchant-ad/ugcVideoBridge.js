import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { isGrokVideoEnabled, merchantAdAspectRatio } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_ROOT = path.resolve(__dirname, '../../../aqond-brain');
const UGC_SCRIPT = path.join(BRAIN_ROOT, 'scripts', 'merchant_ad_ugc.py');

const UGC_TIMEOUT_MS = Number(process.env.AIVOS_MERCHANT_AD_UGC_TIMEOUT_MS || 300000);

export function hasGrokCredentials() {
  if (process.env.AIVOS_MERCHANT_AD_MOCK_GROK === '1' || process.env.AIVOS_MERCHANT_AD_MOCK_UGC === '1') {
    return false;
  }
  return Boolean(String(process.env.XAI_API_KEY || '').trim());
}

export function isUgcMockEnabled() {
  return process.env.AIVOS_MERCHANT_AD_MOCK_UGC === '1' || process.env.AIVOS_MERCHANT_AD_MOCK_GROK === '1';
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function writeDataUrlImage(dataUrl, outPath) {
  const m = String(dataUrl).match(/^data:image\/[^;]+;base64,(.+)$/);
  if (!m) return false;
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, Buffer.from(m[1], 'base64'));
  return true;
}

export async function resolveReferenceImagePath({ request, outDir }) {
  const portrait = String(request.portrait_image_url || '').trim();
  const product = String(request.product_image_url || '').trim();
  const ref = portrait || product;
  if (!ref) return null;
  if (ref.startsWith('data:image/')) {
    const imagePath = path.join(outDir, 'reference.png');
    const ok = await writeDataUrlImage(ref, imagePath);
    return ok ? imagePath : null;
  }
  if (ref.startsWith('http://') || ref.startsWith('https://')) {
    return ref;
  }
  if (await fileExists(ref)) return ref;
  return null;
}

async function createMockUgcClip(outPath, durationSec = 2) {
  const { spawnSync } = await import('child_process');
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=#1a1a2e:s=720x1280:d=${durationSec}`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      outPath,
    ],
    { stdio: 'ignore' },
  );
  return result.status === 0 && (await fileExists(outPath));
}

/**
 * UGC Lip Sync clip generation — spawns merchant_ad_ugc.py (no direct Grok in Director).
 */
export async function generateUgcClip({ prompt, imagePath, durationSec, outPath, aspect, onProgress }) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  if (isUgcMockEnabled()) {
    onProgress?.('ugc_mock_render');
    const ok = await createMockUgcClip(outPath, Math.min(10, durationSec || 2));
    return ok ? outPath : null;
  }

  if (!isGrokVideoEnabled() || !hasGrokCredentials()) return null;
  if (!(await fileExists(UGC_SCRIPT))) return null;
  if (!(await fileExists(imagePath))) return null;

  const py = process.platform === 'win32' ? 'python' : 'python3';
  const args = [
    UGC_SCRIPT,
    '--prompt',
    prompt,
    '--image',
    imagePath,
    '--duration',
    String(durationSec || 10),
    '--out',
    outPath,
    '--aspect',
    aspect || merchantAdAspectRatio(),
  ];

  onProgress?.('ugc_grok_wait');

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
    }, UGC_TIMEOUT_MS);

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
