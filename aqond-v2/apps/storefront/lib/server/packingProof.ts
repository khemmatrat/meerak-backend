import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { appendAqondEvent } from '@/lib/server/aqondEventBus';
import { uploadListingImageWithFallback } from '@/lib/server/minioUpload';

const PROOFS_INDEX = path.join(process.cwd(), '.data', 'dev', 'order-packing-proofs.json');
const PROOFS_DIR = path.join(process.cwd(), '.data', 'order-proofs');

export type OrderPackingProof = {
  order_id: string;
  merchant_id: string;
  photo_url: string;
  storage: 'minio' | 'local';
  uploaded_at: string;
  uploaded_by?: string;
};

type ProofIndex = Record<string, OrderPackingProof>;

export class PackingProofRequiredError extends Error {
  code = 'packing_proof_required' as const;

  constructor() {
    super('packing_proof_required');
    this.name = 'PackingProofRequiredError';
  }
}

/** Default on — set FOOD_PACKING_GATE=false to bypass (rollback). */
export function isFoodPackingGateEnabled(): boolean {
  return process.env.FOOD_PACKING_GATE !== 'false';
}

async function readIndex(): Promise<ProofIndex> {
  try {
    return JSON.parse(await fs.readFile(PROOFS_INDEX, 'utf8')) as ProofIndex;
  } catch {
    return {};
  }
}

async function writeIndex(index: ProofIndex) {
  await fs.mkdir(path.dirname(PROOFS_INDEX), { recursive: true });
  await fs.writeFile(PROOFS_INDEX, JSON.stringify(index, null, 2), 'utf8');
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; mime: string } | null {
  const m = dataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
}

async function saveLocalProofImage(orderId: string, dataUrl: string): Promise<string | null> {
  const parsed = parseDataUrl(dataUrl.startsWith('data:') ? dataUrl : `data:image/jpeg;base64,${dataUrl}`);
  if (!parsed) return null;
  const ext = parsed.mime.includes('png') ? 'png' : parsed.mime.includes('webp') ? 'webp' : 'jpg';
  await fs.mkdir(PROOFS_DIR, { recursive: true });
  const fileName = `${orderId}.${ext}`;
  await fs.writeFile(path.join(PROOFS_DIR, fileName), parsed.buffer);
  return `/api/order-proofs/${encodeURIComponent(orderId)}`;
}

export async function getPackingProof(orderId: string): Promise<OrderPackingProof | null> {
  const index = await readIndex();
  return index[orderId] || null;
}

export async function hasPackingProof(orderId: string): Promise<boolean> {
  return !!(await getPackingProof(orderId));
}

export async function savePackingProof(input: {
  orderId: string;
  merchantId: string;
  imageDataUrl: string;
  uploadedBy?: string;
}): Promise<OrderPackingProof> {
  const existing = await getPackingProof(input.orderId);
  if (existing) return existing;

  const uploaded = await uploadListingImageWithFallback(input.imageDataUrl, `pack-${input.orderId}`);
  let photoUrl: string;
  let storage: 'minio' | 'local';

  if (uploaded?.url) {
    photoUrl = uploaded.url;
    storage = uploaded.storage;
  } else {
    const localUrl = await saveLocalProofImage(input.orderId, input.imageDataUrl);
    if (!localUrl) throw new Error('packing_proof_upload_failed');
    photoUrl = localUrl;
    storage = 'local';
  }

  const proof: OrderPackingProof = {
    order_id: input.orderId,
    merchant_id: input.merchantId,
    photo_url: photoUrl,
    storage,
    uploaded_at: new Date().toISOString(),
    uploaded_by: input.uploadedBy,
  };

  const index = await readIndex();
  index[input.orderId] = proof;
  await writeIndex(index);

  await appendAqondEvent({
    order_id: input.orderId,
    event_type: 'merchant.packing_proof',
    source: 'storefront',
    actor: input.uploadedBy || 'merchant',
    merchant_id: input.merchantId,
    payload: { photo_url: photoUrl, storage },
  });

  return proof;
}

export async function assertPackingProofForReady(orderId: string, orderType?: string): Promise<void> {
  if (!isFoodPackingGateEnabled()) return;
  if (orderType && orderType !== 'food') return;
  if (!(await hasPackingProof(orderId))) {
    throw new PackingProofRequiredError();
  }
}

export async function readLocalProofImage(orderId: string): Promise<{ buffer: Buffer; mime: string } | null> {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const filePath = path.join(PROOFS_DIR, `${orderId}.${ext}`);
    try {
      const buffer = await fs.readFile(filePath);
      const mime =
        ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      return { buffer, mime };
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Minimal 1×1 JPEG for tests. */
export function tinyJpegDataUrl(): string {
  const b64 =
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';
  return `data:image/jpeg;base64,${b64}`;
}
