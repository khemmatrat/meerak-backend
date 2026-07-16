/** Delivery proof rules — food jobs require photo + GPS before complete */

export const FOOD_PHASES_WITH_PHOTO = [
  'rider_assigned',
  'rider_picked_up',
  'en_route',
  'arrived',
  'rider_calling',
  'photo_proof',
  'handoff',
  'cod_payment',
  'rider_completed',
] as const;

const POST_ARRIVAL_PHASES = new Set(['handoff', 'cod_payment', 'rider_completed']);

export type DeliveryProofMeta = {
  delivery_proof_url?: string;
  delivery_proof_at?: string;
  delivery_proof_lat?: number;
  delivery_proof_lng?: number;
};

export function requiresDeliveryPhoto(jobType?: string): boolean {
  return String(jobType || 'food').toLowerCase() !== 'parcel';
}

export function validateRiderPhaseAdvance(input: {
  job_type?: string;
  phase: string;
  next_phase: string;
  proof?: DeliveryProofMeta;
  photo_url?: string;
}): { ok: true } | { ok: false; code: string; message: string } {
  const { job_type, phase, next_phase, proof, photo_url } = input;

  if (next_phase === 'photo_proof' && !photo_url) {
    return {
      ok: false,
      code: 'photo_url_required',
      message: 'ถ่ายรูปหลักฐานก่อนดำเนินการต่อ',
    };
  }

  if (!requiresDeliveryPhoto(job_type)) {
    return { ok: true };
  }

  if (POST_ARRIVAL_PHASES.has(next_phase)) {
    const hasProof = !!(proof?.delivery_proof_url || (next_phase !== 'handoff' && phase === 'photo_proof' && photo_url));
    if (!hasProof && phase !== 'photo_proof') {
      return {
        ok: false,
        code: 'photo_proof_required',
        message: 'งานอาหารต้องถ่ายรูปหลักฐานส่งของก่อนมอบลูกค้า',
      };
    }
  }

  if (next_phase === 'rider_completed' && requiresDeliveryPhoto(job_type)) {
    if (!proof?.delivery_proof_url && !photo_url) {
      return {
        ok: false,
        code: 'photo_proof_required',
        message: 'ต้องมีรูปหลักฐานส่งของก่อนปิดงาน',
      };
    }
  }

  return { ok: true };
}

export function formatProofTimestamp(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
