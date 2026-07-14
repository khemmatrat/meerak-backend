import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.data', 'listings');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');

type Manifest = Record<string, { url: string; updated_at: string }>;

function pickMetaImage(p: { image_url?: string; metadata?: unknown }): string | undefined {
  if (p.image_url) return p.image_url;
  const meta = p.metadata as Record<string, unknown> | undefined;
  if (!meta) return undefined;
  if (typeof meta.image_url === 'string') return meta.image_url;
  const images = meta.images as { url?: string }[] | undefined;
  return images?.[0]?.url;
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[mime] || 'jpg';
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; mime: string } | null {
  const m = dataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
}

async function readManifest(): Promise<Manifest> {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function writeManifest(m: Manifest) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(m, null, 2));
}

/** Persist listing photo locally; served via /api/listing/media/[id] */
export async function saveListingImageLocal(
  imageBase64: string,
  id?: string,
): Promise<{ url: string; id: string; storage: 'local' } | null> {
  const parsed = parseDataUrl(imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`);
  if (!parsed) return null;

  const mediaId = id || crypto.randomUUID();
  const ext = extFromMime(parsed.mime);
  await fs.mkdir(DATA_DIR, { recursive: true });
  const filePath = path.join(DATA_DIR, `${mediaId}.${ext}`);
  await fs.writeFile(filePath, parsed.buffer);

  return { url: `/api/listing/media/${mediaId}`, id: mediaId, storage: 'local' };
}

/** Bind uploaded photo to catalog product id (works even when catalog metadata column ignored). */
export async function bindProductImage(productId: string, imageBase64: string): Promise<string | null> {
  const saved = await saveListingImageLocal(imageBase64, productId);
  if (!saved) return null;
  const manifest = await readManifest();
  manifest[productId] = { url: saved.url, updated_at: new Date().toISOString() };
  await writeManifest(manifest);
  return saved.url;
}

export async function getProductImageUrl(productId: string): Promise<string | undefined> {
  const manifest = await readManifest();
  if (manifest[productId]?.url) return manifest[productId].url;
  const img = await readListingImage(productId);
  if (img) return `/api/listing/media/${productId}`;
  return undefined;
}

export async function readListingImage(id: string): Promise<{ buffer: Buffer; mime: string } | null> {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'gif']) {
    const filePath = path.join(DATA_DIR, `${id}.${ext}`);
    try {
      const buffer = await fs.readFile(filePath);
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      return { buffer, mime };
    } catch {
      /* try next ext */
    }
  }
  return null;
}

export async function enrichProductsWithImages<T extends { id: string; image_url?: string; metadata?: unknown }>(
  products: T[],
): Promise<T[]> {
  const manifest = await readManifest();
  return products.map((p) => ({
    ...p,
    image_url: p.image_url || pickMetaImage(p) || manifest[p.id]?.url,
  }));
}
