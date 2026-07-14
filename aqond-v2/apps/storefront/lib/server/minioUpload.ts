import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { saveListingImageLocal } from '@/lib/server/listingMediaStore';

const ENDPOINT = process.env.MINIO_ENDPOINT || 'http://127.0.0.1:9000';
const PUBLIC_BASE = (process.env.MINIO_PUBLIC_URL || 'http://localhost:9000').replace(/\/$/, '');
const BUCKET = process.env.MINIO_BUCKET || 'aqond-products';
const ACCESS_KEY = process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || 'aqond_minio';
const SECRET_KEY = process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || '';

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: ENDPOINT,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    });
  }
  return client;
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

export type ListingUpload = {
  url: string;
  key?: string;
  storage: 'minio' | 'local';
};

/** Upload to MinIO; returns public URL or null when MinIO unavailable. */
export async function uploadListingImage(
  imageBase64: string,
  opts: { prefix?: string } = {},
): Promise<{ url: string; key: string } | null> {
  const parsed = parseDataUrl(imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`);
  if (!parsed) return null;
  if (!SECRET_KEY) return null;

  const prefix = opts.prefix || 'products';
  const ext = extFromMime(parsed.mime);
  const key = `${prefix}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;

  try {
    await s3().send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: parsed.buffer,
        ContentType: parsed.mime,
      }),
    );
    return { url: `${PUBLIC_BASE}/${BUCKET}/${key}`, key };
  } catch {
    return null;
  }
}

/** MinIO first; local .data fallback so PDP always has an image URL in dev. */
export async function uploadListingImageWithFallback(
  imageBase64: string,
  mediaId?: string,
): Promise<ListingUpload | null> {
  const minio = await uploadListingImage(imageBase64);
  if (minio) return { url: minio.url, key: minio.key, storage: 'minio' };

  const local = await saveListingImageLocal(imageBase64, mediaId);
  if (local) return { url: local.url, storage: 'local' };

  return null;
}

export function minioHealth() {
  return { endpoint: ENDPOINT, bucket: BUCKET, public_base: PUBLIC_BASE, configured: Boolean(SECRET_KEY) };
}
