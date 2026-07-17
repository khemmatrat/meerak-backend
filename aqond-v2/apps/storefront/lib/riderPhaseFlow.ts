import { isFoodPickupQrRequired } from '@/lib/riderPickupFlow';

/**
 * Rider active-job phase flows — action buttons (Grab-style A→B legs).
 * Mirrors dispatch-svc phase names; UI may skip intermediate en_route_* steps.
 */

export type RiderFlowLeg = 'pickup' | 'dropoff' | 'complete';

export type RiderAction = {
  phase: string;
  label: string;
  needsPhoto?: boolean;
  leg: RiderFlowLeg;
  stepLabel?: string;
};

export type RiderFlowStage = {
  step: 1 | 2 | 3;
  title: string;
  subtitle: string;
  leg: RiderFlowLeg;
};

const PASSENGER_PICKUP = new Set([
  'finding_rider',
  'pending_accept',
  'rider_assigned',
  'en_route_pickup',
  'arrived_pickup',
]);

function isCod(paymentMethod?: string) {
  const m = String(paymentMethod || 'cod').toLowerCase();
  return m === 'cod' || m === 'cash';
}

/** Milestone banner for active job header */
export function riderFlowStage(
  phase: string,
  jobType?: string,
): RiderFlowStage | null {
  const jt = (jobType || 'food').toLowerCase();
  if (jt === 'passenger') {
    if (PASSENGER_PICKUP.has(phase)) {
      return { step: 1, title: 'ขั้นที่ 1 — ไปจุดรับผู้โดยสาร', subtitle: 'จุด A', leg: 'pickup' };
    }
    if (phase === 'passenger_aboard' || phase === 'en_route_dropoff') {
      return { step: 2, title: 'ขั้นที่ 2 — ไปจุดส่งผู้โดยสาร', subtitle: 'จุด B', leg: 'dropoff' };
    }
    if (phase === 'arrived_dropoff') {
      return { step: 3, title: 'ถึงจุดหมายแล้ว', subtitle: 'ยืนยันปิดงาน', leg: 'complete' };
    }
    return null;
  }

  const atPickup = [
    'finding_rider',
    'pending_accept',
    'rider_assigned',
    'food_ready',
    'arrived_merchant',
    'qr_verified',
    'pickup_photo',
  ].includes(phase);
  const enRouteDrop =
    phase === 'rider_picked_up' ||
    phase === 'en_route' ||
    phase === 'arrived' ||
    phase === 'rider_calling' ||
    phase === 'photo_proof' ||
    phase === 'handoff' ||
    phase === 'cod_payment';

  if (atPickup) {
    const label =
      jt === 'parcel' ? 'ขั้นที่ 1 — ไปจุดรับพัสดุ' : 'ขั้นที่ 1 — ไปร้านรับอาหาร/สินค้า';
    return { step: 1, title: label, subtitle: 'จุด A', leg: 'pickup' };
  }
  if (enRouteDrop) {
    const label = jt === 'parcel' ? 'ขั้นที่ 2 — ไปจุดส่งพัสดุ' : 'ขั้นที่ 2 — ไปจุดส่งลูกค้า';
    return { step: 2, title: label, subtitle: 'จุด B', leg: 'dropoff' };
  }
  return null;
}

function nextPassengerAction(phase: string): RiderAction | null {
  switch (phase) {
    case 'finding_rider':
    case 'food_ready':
    case 'pending_accept':
      return {
        phase: 'en_route_pickup',
        label: '🛵 เริ่มเดินทางไปจุดรับ',
        leg: 'pickup',
        stepLabel: 'ไปจุดรับ',
      };
    case 'rider_assigned':
    case 'en_route_pickup':
      return {
        phase: 'arrived_pickup',
        label: '📍 ถึงจุดรับแล้ว',
        leg: 'pickup',
        stepLabel: 'ยืนยันจุดรับ',
      };
    case 'arrived_pickup':
      return {
        phase: 'passenger_aboard',
        label: '🚗 ผู้โดยสารขึ้นรถแล้ว — ไปจุดส่ง',
        leg: 'dropoff',
        stepLabel: 'ออกเดินทาง',
      };
    case 'passenger_aboard':
    case 'en_route_dropoff':
      return {
        phase: 'arrived_dropoff',
        label: '🏁 ถึงจุดหมายแล้ว',
        leg: 'dropoff',
        stepLabel: 'ยืนยันจุดส่ง',
      };
    case 'arrived_dropoff':
      return {
        phase: 'trip_completed',
        label: '✅ สิ้นสุดงาน',
        leg: 'complete',
        stepLabel: 'ปิดงาน',
      };
    default:
      return null;
  }
}

function nextParcelAction(phase: string): RiderAction | null {
  switch (phase) {
    case 'finding_rider':
    case 'food_ready':
    case 'pending_accept':
      return {
        phase: 'rider_assigned',
        label: '🛵 เริ่มไปจุดรับพัสดุ',
        leg: 'pickup',
      };
    case 'rider_assigned':
      return {
        phase: 'rider_picked_up',
        label: '📍 ถึงจุดรับแล้ว — รับพัสดุ',
        leg: 'pickup',
        stepLabel: 'ยืนยันรับพัสดุ',
      };
    case 'rider_picked_up':
    case 'en_route':
      return {
        phase: 'arrived',
        label: '🏠 ถึงจุดส่งแล้ว',
        leg: 'dropoff',
        stepLabel: 'ยืนยันจุดส่ง',
      };
    case 'arrived':
    case 'handoff':
      return {
        phase: 'rider_completed',
        label: '✅ ส่งมอบแล้ว — สิ้นสุดงาน',
        leg: 'complete',
        stepLabel: 'ปิดงาน',
      };
    default:
      return null;
  }
}

function nextFoodAction(phase: string, paymentMethod?: string): RiderAction | null {
  const qrRequired = isFoodPickupQrRequired();

  if (qrRequired) {
    switch (phase) {
      case 'finding_rider':
      case 'food_ready':
      case 'pending_accept':
        return {
          phase: 'rider_assigned',
          label: '🛵 เริ่มไปร้าน',
          leg: 'pickup',
        };
      case 'rider_assigned':
        return {
          phase: 'arrived_merchant',
          label: '📍 ถึงร้านแล้ว',
          leg: 'pickup',
          stepLabel: 'ยืนยันถึงร้าน',
        };
      case 'arrived_merchant':
        return null;
      case 'qr_verified':
        return {
          phase: 'pickup_photo',
          label: '📷 ถ่ายรูปรับจากร้าน',
          needsPhoto: true,
          leg: 'pickup',
          stepLabel: 'หลักฐานรับอาหาร',
        };
      case 'pickup_photo':
        return null;
      case 'rider_picked_up':
      case 'en_route':
        return {
          phase: 'arrived',
          label: '🏠 ถึงจุดส่งแล้ว',
          leg: 'dropoff',
          stepLabel: 'ยืนยันจุดส่ง',
        };
      case 'arrived':
      case 'rider_calling':
        return {
          phase: 'photo_proof',
          label: '📷 ถ่ายรูปหลักฐานส่งของ',
          needsPhoto: true,
          leg: 'dropoff',
          stepLabel: 'หลักฐานการส่ง',
        };
      case 'photo_proof':
        return {
          phase: 'handoff',
          label: '🤝 ส่งมอบลูกค้าแล้ว',
          leg: 'dropoff',
          stepLabel: 'ส่งมอบ',
        };
      case 'handoff':
        if (isCod(paymentMethod)) {
          return {
            phase: 'cod_payment',
            label: '💵 เก็บเงินปลายทางแล้ว',
            leg: 'dropoff',
            stepLabel: 'COD',
          };
        }
        return {
          phase: 'rider_completed',
          label: '✅ สิ้นสุดงาน',
          leg: 'complete',
          stepLabel: 'ปิดงาน',
        };
      case 'cod_payment':
        return {
          phase: 'rider_completed',
          label: '✅ สิ้นสุดงาน',
          leg: 'complete',
          stepLabel: 'ปิดงาน',
        };
      default:
        return null;
    }
  }

  switch (phase) {
    case 'finding_rider':
    case 'food_ready':
    case 'pending_accept':
      return {
        phase: 'rider_assigned',
        label: '🛵 เริ่มไปร้าน',
        leg: 'pickup',
      };
    case 'rider_assigned':
      return {
        phase: 'rider_picked_up',
        label: '🍽️ ถึงร้านแล้ว — รับอาหาร',
        leg: 'pickup',
        stepLabel: 'ยืนยันรับที่ร้าน',
      };
    case 'rider_picked_up':
    case 'en_route':
      return {
        phase: 'arrived',
        label: '🏠 ถึงจุดส่งแล้ว',
        leg: 'dropoff',
        stepLabel: 'ยืนยันจุดส่ง',
      };
    case 'arrived':
    case 'rider_calling':
      return {
        phase: 'photo_proof',
        label: '📷 ถ่ายรูปหลักฐานส่งของ',
        needsPhoto: true,
        leg: 'dropoff',
        stepLabel: 'หลักฐานการส่ง',
      };
    case 'photo_proof':
      return {
        phase: 'handoff',
        label: '🤝 ส่งมอบลูกค้าแล้ว',
        leg: 'dropoff',
        stepLabel: 'ส่งมอบ',
      };
    case 'handoff':
      if (isCod(paymentMethod)) {
        return {
          phase: 'cod_payment',
          label: '💵 เก็บเงินปลายทางแล้ว',
          leg: 'dropoff',
          stepLabel: 'COD',
        };
      }
      return {
        phase: 'rider_completed',
        label: '✅ สิ้นสุดงาน',
        leg: 'complete',
        stepLabel: 'ปิดงาน',
      };
    case 'cod_payment':
      return {
        phase: 'rider_completed',
        label: '✅ สิ้นสุดงาน',
        leg: 'complete',
        stepLabel: 'ปิดงาน',
      };
    default:
      return null;
  }
}

export function nextRiderAction(
  phase: string,
  jobType?: string,
  opts?: { paymentMethod?: string },
): RiderAction | null {
  const jt = (jobType || 'food').toLowerCase();
  if (jt === 'passenger') return nextPassengerAction(phase);
  if (jt === 'parcel') return nextParcelAction(phase);
  return nextFoodAction(phase, opts?.paymentMethod);
}

/** Ordered phases for local dispatch validation (allows skipped en_route_* in UI). */
export const PASSENGER_PHASE_FLOW = [
  'rider_assigned',
  'en_route_pickup',
  'arrived_pickup',
  'passenger_aboard',
  'en_route_dropoff',
  'arrived_dropoff',
  'trip_completed',
] as const;

export const FOOD_PHASE_FLOW = [
  'rider_assigned',
  'arrived_merchant',
  'qr_verified',
  'pickup_photo',
  'rider_picked_up',
  'en_route',
  'arrived',
  'photo_proof',
  'handoff',
  'cod_payment',
  'rider_completed',
] as const;

export const FOOD_PHASE_FLOW_LEGACY = [
  'rider_assigned',
  'rider_picked_up',
  'en_route',
  'arrived',
  'photo_proof',
  'handoff',
  'cod_payment',
  'rider_completed',
] as const;

export const PARCEL_PHASE_FLOW = [
  'rider_assigned',
  'rider_picked_up',
  'en_route',
  'arrived',
  'rider_completed',
] as const;

export function phaseFlowForJobType(jobType?: string): readonly string[] {
  const jt = (jobType || 'food').toLowerCase();
  if (jt === 'passenger') return PASSENGER_PHASE_FLOW;
  if (jt === 'parcel') return PARCEL_PHASE_FLOW;
  return isFoodPickupQrRequired() ? FOOD_PHASE_FLOW : FOOD_PHASE_FLOW_LEGACY;
}

export function isValidPhaseAdvance(
  current: string,
  target: string,
  jobType?: string,
  opts?: { paymentMethod?: string },
): boolean {
  if (current === target) return false;
  const jt = (jobType || 'food').toLowerCase();

  if (jt === 'passenger') {
    const passengerAllowed: Record<string, string[]> = {
      finding_rider: ['en_route_pickup', 'arrived_pickup', 'rider_assigned'],
      rider_assigned: ['en_route_pickup', 'arrived_pickup'],
      en_route_pickup: ['arrived_pickup'],
      arrived_pickup: ['passenger_aboard', 'en_route_dropoff'],
      passenger_aboard: ['en_route_dropoff', 'arrived_dropoff'],
      en_route_dropoff: ['arrived_dropoff'],
      arrived_dropoff: ['trip_completed'],
    };
    return passengerAllowed[current]?.includes(target) ?? false;
  }

  if (jt === 'parcel') {
    const parcelAllowed: Record<string, string[]> = {
      rider_assigned: ['rider_picked_up'],
      rider_picked_up: ['en_route', 'arrived'],
      en_route: ['arrived'],
      arrived: ['handoff', 'rider_completed'],
      handoff: ['rider_completed'],
    };
    return parcelAllowed[current]?.includes(target) ?? false;
  }

  // food
  const foodAllowed: Record<string, string[]> = isFoodPickupQrRequired()
    ? {
        rider_assigned: ['arrived_merchant', 'qr_verified'],
        arrived_merchant: ['qr_verified'],
        qr_verified: ['pickup_photo'],
        pickup_photo: ['rider_picked_up'],
        rider_picked_up: ['en_route', 'arrived'],
        en_route: ['arrived'],
        arrived: ['photo_proof', 'rider_calling'],
        rider_calling: ['photo_proof'],
        photo_proof: ['handoff'],
        handoff: ['cod_payment', 'rider_completed'],
        cod_payment: ['rider_completed'],
      }
    : {
        rider_assigned: ['rider_picked_up'],
        rider_picked_up: ['en_route', 'arrived'],
        en_route: ['arrived'],
        arrived: ['photo_proof', 'rider_calling'],
        rider_calling: ['photo_proof'],
        photo_proof: ['handoff'],
        handoff: ['cod_payment', 'rider_completed'],
        cod_payment: ['rider_completed'],
      };
  if (foodAllowed[current]?.includes(target)) {
    if (current === 'handoff' && target === 'rider_completed' && isCod(opts?.paymentMethod)) {
      return false;
    }
    return true;
  }

  const flow = phaseFlowForJobType(jobType);
  const curIdx = flow.indexOf(current);
  const tgtIdx = flow.indexOf(target);
  if (curIdx < 0 || tgtIdx < 0) return true;
  return tgtIdx > curIdx;
}
