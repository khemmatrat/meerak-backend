import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { appendAqondEvent } from '@/lib/server/aqondEventBus';
import {
  decodeOrderPickupQr,
  validateOrderPickupQr,
  type OrderPickupQrPayload,
} from '@/lib/server/merchantOrderQr';
import { uploadListingImageWithFallback } from '@/lib/server/minioUpload';
import { fetchOrderForDispatch } from '@/lib/server/merchantOrders';

const VERIFY_INDEX = path.join(process.cwd(), '.data', 'dev', 'pickup-verifications.json');
const NONCE_INDEX = path.join(process.cwd(), '.data', 'dev', 'pickup-qr-nonces.json');
const PICKUP_PHOTOS_DIR = path.join(process.cwd(), '.data', 'pickup-proofs');

export type VerificationResultCode =
  | 'SUCCESS'
  | 'FAILED'
  | 'EXPIRED'
  | 'INVALID_SIGNATURE'
  | 'ORDER_ALREADY_PICKED_UP'
  | 'WRONG_MERCHANT'
  | 'WRONG_ORDER'
  | 'QR_REPLAY';

export type PickupVerificationRecord = {
  order_id: string;
  merchant_id: string;
  rider_id?: string;
  qr_verified_at?: string;
  pickup_photo_url?: string;
  pickup_photo_at?: string;
  pickup_completed_at?: string;
  verification_method?: 'qr_scan' | 'legacy_skip';
  verification_result?: VerificationResultCode;
  qr_signature?: string;
  photo_hash?: string;
  device_id?: string;
  gps_lat?: number;
  gps_lng?: number;
  accuracy?: number;
  captured_at?: string;
  captured_by?: string;
};

type VerifyIndex = Record<string, PickupVerificationRecord>;
type NonceIndex = Record<string, { order_id: string; consumed_at: string }>;

export function isFoodPickupQrRequired(): boolean {
  return process.env.FOOD_PICKUP_QR_REQUIRED !== 'false';
}

async function readIndex(): Promise<VerifyIndex> {
  try {
    return JSON.parse(await fs.readFile(VERIFY_INDEX, 'utf8')) as VerifyIndex;
  } catch {
    return {};
  }
}

async function writeIndex(index: VerifyIndex) {
  await fs.mkdir(path.dirname(VERIFY_INDEX), { recursive: true });
  await fs.writeFile(VERIFY_INDEX, JSON.stringify(index, null, 2), 'utf8');
}

async function readNonces(): Promise<NonceIndex> {
  try {
    return JSON.parse(await fs.readFile(NONCE_INDEX, 'utf8')) as NonceIndex;
  } catch {
    return {};
  }
}

async function writeNonces(index: NonceIndex) {
  await fs.mkdir(path.dirname(NONCE_INDEX), { recursive: true });
  await fs.writeFile(NONCE_INDEX, JSON.stringify(index, null, 2), 'utf8');
}

function nonceKey(orderId: string, sig: string): string {
  return `${orderId}:${sig}`;
}

function sha256Hex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; mime: string } | null {
  const m = dataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
}

async function saveLocalPickupPhoto(orderId: string, dataUrl: string): Promise<string | null> {
  const parsed = parseDataUrl(dataUrl.startsWith('data:') ? dataUrl : `data:image/jpeg;base64,${dataUrl}`);
  if (!parsed) return null;
  const ext = parsed.mime.includes('png') ? 'png' : parsed.mime.includes('webp') ? 'webp' : 'jpg';
  await fs.mkdir(PICKUP_PHOTOS_DIR, { recursive: true });
  await fs.writeFile(path.join(PICKUP_PHOTOS_DIR, `${orderId}.${ext}`), parsed.buffer);
  return `/api/pickup-proofs/${encodeURIComponent(orderId)}`;
}

export async function readLocalPickupPhoto(orderId: string): Promise<{ buffer: Buffer; mime: string } | null> {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    try {
      const buffer = await fs.readFile(path.join(PICKUP_PHOTOS_DIR, `${orderId}.${ext}`));
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      return { buffer, mime };
    } catch {
      /* next */
    }
  }
  return null;
}

export async function getPickupVerification(orderId: string): Promise<PickupVerificationRecord | null> {
  const index = await readIndex();
  return index[orderId] || null;
}

function eventPayload(rec: Partial<PickupVerificationRecord>, extra?: Record<string, unknown>) {
  return {
    captured_at: rec.captured_at || rec.qr_verified_at || rec.pickup_photo_at || rec.pickup_completed_at,
    captured_by: rec.captured_by || rec.rider_id,
    merchant_id: rec.merchant_id,
    device_id: rec.device_id,
    gps_lat: rec.gps_lat,
    gps_lng: rec.gps_lng,
    accuracy: rec.accuracy,
    photo_hash: rec.photo_hash,
    qr_signature: rec.qr_signature,
    verification_result: rec.verification_result,
    verification_method: rec.verification_method,
    ...extra,
  };
}

export async function verifyPickupQr(input: {
  orderId: string;
  qrRaw: string;
  riderId?: string;
  deviceId?: string;
  gpsLat?: number;
  gpsLng?: number;
  accuracy?: number;
  jobMerchantId?: string;
}): Promise<{ result: VerificationResultCode; record?: PickupVerificationRecord; payload?: OrderPickupQrPayload }> {
  const index = await readIndex();
  const existing = index[input.orderId];
  if (existing?.pickup_completed_at || existing?.qr_verified_at) {
    return { result: 'ORDER_ALREADY_PICKED_UP', record: existing };
  }

  const payload = decodeOrderPickupQr(input.qrRaw.trim());
  if (!payload) {
    return { result: 'FAILED' };
  }

  if (payload.order_id !== input.orderId) {
    return { result: 'WRONG_ORDER', payload };
  }

  const order = await fetchOrderForDispatch(input.orderId);
  const expectedMerchant = order?.merchant_id || input.jobMerchantId;
  if (expectedMerchant && payload.merchant_id !== expectedMerchant) {
    return { result: 'WRONG_MERCHANT', payload };
  }

  const nonces = await readNonces();
  const nk = nonceKey(payload.order_id, payload.sig);
  if (nonces[nk]) {
    return { result: 'ORDER_ALREADY_PICKED_UP', payload };
  }

  const valid = validateOrderPickupQr(payload);
  if (!valid.ok) {
    if (valid.code === 'qr_expired') return { result: 'EXPIRED', payload };
    if (valid.code === 'invalid_signature') return { result: 'INVALID_SIGNATURE', payload };
    return { result: 'FAILED', payload };
  }

  const now = new Date().toISOString();
  const record: PickupVerificationRecord = {
    order_id: input.orderId,
    merchant_id: payload.merchant_id,
    rider_id: input.riderId,
    qr_verified_at: now,
    verification_method: 'qr_scan',
    verification_result: 'SUCCESS',
    qr_signature: payload.sig,
    device_id: input.deviceId,
    gps_lat: input.gpsLat,
    gps_lng: input.gpsLng,
    accuracy: input.accuracy,
    captured_at: now,
    captured_by: input.riderId,
  };

  index[input.orderId] = record;
  await writeIndex(index);

  nonces[nk] = { order_id: input.orderId, consumed_at: now };
  await writeNonces(nonces);

  await appendAqondEvent({
    order_id: input.orderId,
    event_type: 'rider.qr_verified',
    source: 'storefront',
    actor: input.riderId || 'rider',
    rider_id: input.riderId,
    merchant_id: payload.merchant_id,
    payload: eventPayload(record, { qr_payload: payload }),
  });

  return { result: 'SUCCESS', record, payload };
}

export async function savePickupProofPhoto(input: {
  orderId: string;
  riderId?: string;
  imageDataUrl: string;
  deviceId?: string;
  gpsLat?: number;
  gpsLng?: number;
  accuracy?: number;
}): Promise<{ ok: true; record: PickupVerificationRecord } | { ok: false; code: string }> {
  const index = await readIndex();
  const rec = index[input.orderId];
  if (!rec?.qr_verified_at && isFoodPickupQrRequired()) {
    return { ok: false, code: 'qr_not_verified' };
  }
  if (rec?.pickup_photo_url) {
    return { ok: true, record: rec };
  }

  const parsed = parseDataUrl(
    input.imageDataUrl.startsWith('data:') ? input.imageDataUrl : `data:image/jpeg;base64,${input.imageDataUrl}`,
  );
  if (!parsed) return { ok: false, code: 'invalid_image' };

  const photoHash = sha256Hex(parsed.buffer);
  const uploaded = await uploadListingImageWithFallback(input.imageDataUrl, `pickup-${input.orderId}`);
  let photoUrl: string;
  if (uploaded?.url) {
    photoUrl = uploaded.url;
  } else {
    const local = await saveLocalPickupPhoto(input.orderId, input.imageDataUrl);
    if (!local) return { ok: false, code: 'upload_failed' };
    photoUrl = local;
  }

  const now = new Date().toISOString();
  const updated: PickupVerificationRecord = {
    ...rec,
    order_id: input.orderId,
    merchant_id: rec?.merchant_id || '',
    rider_id: input.riderId || rec?.rider_id,
    pickup_photo_url: photoUrl,
    pickup_photo_at: now,
    photo_hash: photoHash,
    device_id: input.deviceId || rec?.device_id,
    gps_lat: input.gpsLat ?? rec?.gps_lat,
    gps_lng: input.gpsLng ?? rec?.gps_lng,
    accuracy: input.accuracy ?? rec?.accuracy,
    captured_at: now,
    captured_by: input.riderId || rec?.captured_by,
    verification_result: 'SUCCESS',
  };
  index[input.orderId] = updated;
  await writeIndex(index);

  await appendAqondEvent({
    order_id: input.orderId,
    event_type: 'rider.pickup_photo',
    source: 'storefront',
    actor: input.riderId || 'rider',
    rider_id: input.riderId,
    merchant_id: updated.merchant_id,
    payload: eventPayload(updated, { photo_url: photoUrl }),
  });

  return { ok: true, record: updated };
}

export async function completePickupVerification(input: {
  orderId: string;
  riderId?: string;
  jobId?: string;
}): Promise<{ ok: true; record: PickupVerificationRecord } | { ok: false; code: string }> {
  const index = await readIndex();
  let rec = index[input.orderId];

  if (!rec && !isFoodPickupQrRequired()) {
    rec = {
      order_id: input.orderId,
      merchant_id: '',
      rider_id: input.riderId,
      verification_method: 'legacy_skip',
      verification_result: 'SUCCESS',
      pickup_completed_at: new Date().toISOString(),
      captured_at: new Date().toISOString(),
      captured_by: input.riderId,
    };
    index[input.orderId] = rec;
    await writeIndex(index);
  }

  if (!rec) return { ok: false, code: 'not_started' };
  if (isFoodPickupQrRequired() && !rec.qr_verified_at) return { ok: false, code: 'qr_not_verified' };
  if (isFoodPickupQrRequired() && !rec.pickup_photo_url) return { ok: false, code: 'pickup_photo_required' };
  if (rec.pickup_completed_at) return { ok: true, record: rec };

  const now = new Date().toISOString();
  const updated: PickupVerificationRecord = {
    ...rec,
    pickup_completed_at: now,
    captured_at: now,
    captured_by: input.riderId || rec.captured_by,
    verification_result: 'SUCCESS',
  };
  index[input.orderId] = updated;
  await writeIndex(index);

  await appendAqondEvent({
    order_id: input.orderId,
    event_type: 'rider.pickup_completed',
    source: 'storefront',
    actor: input.riderId || 'rider',
    rider_id: input.riderId,
    job_id: input.jobId,
    merchant_id: updated.merchant_id,
    payload: eventPayload(updated),
  });

  return { ok: true, record: updated };
}

export async function assertCanDepartMerchant(
  orderId: string,
  jobType?: string,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  if ((jobType || 'food').toLowerCase() !== 'food') return { ok: true };
  if (!isFoodPickupQrRequired()) return { ok: true };

  const rec = await getPickupVerification(orderId);
  if (!rec?.qr_verified_at) {
    return { ok: false, code: 'qr_not_verified', message: 'สแกน QR รับออเดอร์จากร้านก่อน' };
  }
  if (!rec.pickup_photo_url) {
    return { ok: false, code: 'pickup_photo_required', message: 'ถ่ายรูปรับอาหารจากร้านก่อนออกเดินทาง' };
  }
  if (!rec.pickup_completed_at) {
    return { ok: false, code: 'pickup_not_completed', message: 'ยืนยันรับอาหารไม่ครบ' };
  }
  return { ok: true };
}

export function attachPickupFieldsToTrack(
  view: Record<string, unknown>,
  rec: PickupVerificationRecord | null,
) {
  if (!rec) return view;
  if (rec.qr_verified_at) view.pickup_verified_at = rec.qr_verified_at;
  if (rec.pickup_photo_url) view.pickup_photo_url = rec.pickup_photo_url;
  if (rec.rider_id) view.pickup_verified_by = rec.rider_id;
  if (rec.verification_method) view.verification_method = rec.verification_method;
  if (rec.pickup_completed_at) view.pickup_completed_at = rec.pickup_completed_at;
  return view;
}

/** Test helper — reset state for an order */
export async function _testResetPickup(orderId: string) {
  const index = await readIndex();
  delete index[orderId];
  await writeIndex(index);
}
