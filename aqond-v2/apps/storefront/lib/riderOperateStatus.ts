import type { RiderProfile } from '@/lib/rider';

/** ขั้นต่ำเครดิตที่ต้องมีเพื่อรับงาน (500 micro = ฿5) */
export const MIN_CREDIT_TO_ACCEPT_MICRO = 500;

export type RiderBlocker = {
  id: string;
  title: string;
  detail?: string;
  fixHref?: string;
  severity: 'block' | 'warn';
};

export type RiderAcceptStatus = {
  blockers: RiderBlocker[];
  canAcceptJobs: boolean;
  statusLabel: string;
  statusTone: 'ready' | 'warn' | 'offline' | 'blocked';
};

export function computeRiderAcceptStatus(input: {
  hasAuth: boolean;
  profile: RiderProfile | null | undefined;
  profileLoading?: boolean;
  online: boolean;
  gpsSupported: boolean;
  gpsDenied: boolean;
  gpsReady: boolean;
  gpsLocating?: boolean;
  availableCreditMicro?: number | null;
  hasActiveJob?: boolean;
  availability?: 'online' | 'break' | 'offline';
  faceSession?: {
    daily_active?: boolean;
    online_active?: boolean;
    strict_due?: boolean;
    reverify_due?: boolean;
    verify_level?: string;
    strict_interval_days?: number;
  } | null;
}): RiderAcceptStatus {
  const blockers: RiderBlocker[] = [];

  if (!input.hasAuth) {
    blockers.push({
      id: 'no_auth',
      title: 'ยังไม่ได้เข้าสู่ระบบ',
      detail: 'เข้าสู่ระบบก่อนรับงาน',
      fixHref: '/m/login',
      severity: 'block',
    });
  }

  if (input.hasAuth && !input.profileLoading && !input.profile?.rider_id) {
    blockers.push({
      id: 'not_registered',
      title: 'ยังไม่ได้สมัคร Rider OS',
      detail: 'สมัครและยืนยันตัวตนก่อนรับงาน',
      fixHref: '/m/rider/signup',
      severity: 'block',
    });
  }

  const p = input.profile;
  if (p?.rider_id) {
    if (p.suspended) {
      blockers.push({
        id: 'suspended',
        title: 'บัญชีถูกระงับชั่วคราว',
        detail: 'ติดต่อฝ่ายสนับสนุน',
        severity: 'block',
      });
    } else if (p.active !== true) {
      blockers.push({
        id: 'inactive',
        title: 'บัญชียังไม่เปิดใช้งาน',
        severity: 'block',
      });
    } else {
      const kyc = String(p.kyc_status || '').toLowerCase();
      if (kyc === 'rejected') {
        blockers.push({
          id: 'kyc_rejected',
          title: 'การยืนยันตัวตนไม่ผ่าน',
          detail: 'ส่งเอกสารใหม่ที่หน้าสมัคร',
          fixHref: '/m/rider/signup',
          severity: 'block',
        });
      } else if (kyc !== 'approved') {
        blockers.push({
          id: 'kyc_pending',
          title: 'รอแอดมินอนุมัติ KYC',
          detail: 'ดูงานเปิดได้ แต่ยังรับงานไม่ได้',
          severity: 'block',
        });
      }
    }
  }

  if (p?.rider_id && p.active && String(p.kyc_status || '').toLowerCase() === 'approved' && !p.suspended) {
    if (!input.online) {
      blockers.push({
        id: 'offline',
        title: 'สถานะออฟไลน์',
        detail: 'กดปุ่มด้านบนเพื่อเปิดออนไลน์',
        severity: 'block',
      });
    } else if (input.availability === 'break') {
      blockers.push({
        id: 'on_break',
        title: 'อยู่ในโหมดพัก',
        detail: 'เปลี่ยนเป็นออนไลน์เพื่อรับงาน',
        severity: 'block',
      });
    } else {
      if (!input.gpsSupported) {
        blockers.push({
          id: 'no_gps',
          title: 'อุปกรณ์ไม่รองรับ GPS',
          severity: 'warn',
        });
      } else if (input.gpsDenied) {
        blockers.push({
          id: 'gps_denied',
          title: 'ไม่อนุญาตตำแหน่งที่ตั้ง',
          detail: 'เปิดสิทธิ์ GPS ในเบราว์เซอร์/แอป',
          severity: 'block',
        });
      } else if (input.gpsLocating || !input.gpsReady) {
        blockers.push({
          id: 'gps_locating',
          title: 'กำลังหาตำแหน่ง GPS',
          detail: 'รอสักครู่เพื่อจับคู่งานใกล้คุณ',
          severity: 'warn',
        });
      }

      const avail = input.availableCreditMicro;
      if (avail != null && avail < MIN_CREDIT_TO_ACCEPT_MICRO) {
        blockers.push({
          id: 'low_credit',
          title: 'เครดิตไม่พอรับงาน',
          detail: `ต้องมีอย่างน้อย ฿${(MIN_CREDIT_TO_ACCEPT_MICRO / 100).toFixed(0)} — เติมเครดิตที่แท็บเครดิต`,
          fixHref: '/m/rider/wallet',
          severity: 'block',
        });
      }

      const face = input.faceSession;
      const dailyOk = face?.daily_active ?? face?.online_active;
      const strictDue = face?.strict_due ?? face?.reverify_due;
      const strictDays =
        face?.strict_interval_days ??
        (face?.verify_level === 'strong' ? 3 : 5);

      if (strictDue) {
        blockers.push({
          id: 'face_strict',
          title: 'ครบรอบตรวจเข้มงวด',
          detail: `สแกนหน้าอีกครั้ง (ทุก ${strictDays} วัน) — เหมือนตอกบัตรรอบลึก`,
          severity: 'block',
        });
      } else if (face && !dailyOk && input.online) {
        blockers.push({
          id: 'face_daily',
          title: 'ยังไม่ได้ตอกบัตรเช้านี้',
          detail: 'สแกนหน้าวันละครั้งก่อนเปิดออนไลน์',
          severity: 'block',
        });
      }
    }
  }

  const hardBlocks = blockers.filter((b) => b.severity === 'block');
  const canAcceptJobs = hardBlocks.length === 0 && !!p?.rider_id;

  let statusLabel = 'พร้อมรับงาน';
  let statusTone: RiderAcceptStatus['statusTone'] = 'ready';
  if (!input.hasAuth || !p?.rider_id) {
    statusLabel = 'เริ่มต้นใช้งาน';
    statusTone = 'blocked';
  } else if (hardBlocks.some((b) => b.id === 'kyc_pending' || b.id === 'kyc_rejected' || b.id === 'suspended')) {
    statusLabel = 'รออนุมัติ / ถูกระงับ';
    statusTone = 'blocked';
  } else if (!input.online) {
    statusLabel = 'ออฟไลน์';
    statusTone = 'offline';
  } else if (input.availability === 'break') {
    statusLabel = 'พัก — ไม่รับงาน';
    statusTone = 'offline';
  } else if (!canAcceptJobs) {
    statusLabel = 'ยังรับงานไม่ได้';
    statusTone = 'warn';
  } else if (blockers.some((b) => b.severity === 'warn')) {
    statusLabel = 'ออนไลน์ — กำลังเตรียมพร้อม';
    statusTone = 'warn';
  }

  return { blockers, canAcceptJobs, statusLabel, statusTone };
}
