import { fetchMerchantDashboard } from '@/lib/merchant';

export type CapabilityId = 'shop' | 'delivery' | 'sell' | 'messenger';

export type CapabilityStatus = 'locked' | 'none' | 'pending' | 'active';

export type PartnerCapability = {
  id: CapabilityId;
  status: CapabilityStatus;
  label: string;
  detail?: string;
  href: string;
  cta: string;
  icon: string;
  external?: boolean;
};

type RiderMe = {
  rider_id?: string;
  kyc_status?: string;
  active?: boolean;
};

async function fetchRiderMe(userId: string): Promise<RiderMe | null> {
  try {
    const res = await fetch(`/api/rider/me?user_id=${encodeURIComponent(userId)}`, { cache: 'no-store' });
    if (res.status === 404) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return data as RiderMe;
  } catch {
    return null;
  }
}

function riderStatus(rider: RiderMe | null): CapabilityStatus {
  if (!rider?.rider_id) return 'none';
  const kyc = String(rider.kyc_status || '').toLowerCase();
  if (kyc === 'approved' && rider.active) return 'active';
  if (kyc === 'pending' || kyc === 'submitted') return 'pending';
  return 'none';
}

function merchantStatus(dash: Awaited<ReturnType<typeof fetchMerchantDashboard>> | null): CapabilityStatus {
  if (!dash) return 'none';
  const approved = (dash.accessible_shops || []).filter((s) => s.status === 'approved');
  if (approved.length > 0) return 'active';
  if ((dash.pending_shops || []).length > 0 || (dash.usage?.pending || 0) > 0) return 'pending';
  return 'none';
}

export async function loadPartnerCapabilities(
  userId: string | undefined,
  opts?: { mobileAppUrl?: string },
): Promise<PartnerCapability[]> {
  const locked = !userId;
  const mobileUrl = opts?.mobileAppUrl || 'https://app.aqond.com';

  if (locked) {
    return [
      { id: 'shop', status: 'locked', label: 'จัดการร้าน', href: '/m/login?next=/m/account', cta: 'เข้าสู่ระบบ', icon: '🏪' },
      { id: 'delivery', status: 'locked', label: 'รับงานส่งของ', href: '/m/login?next=/m/account', cta: 'เข้าสู่ระบบ', icon: '🛵' },
      { id: 'sell', status: 'locked', label: 'ลงขายสินค้า', href: '/m/login?next=/m/account', cta: 'เข้าสู่ระบบ', icon: '✨' },
      { id: 'messenger', status: 'locked', label: 'Messenger / คนขับ', href: mobileUrl, cta: 'แอปมือถือ', icon: '📱', external: true },
    ];
  }

  const [dash, rider] = await Promise.all([
    fetchMerchantDashboard(userId).catch(() => null),
    fetchRiderMe(userId),
  ]);

  const mStatus = merchantStatus(dash);
  const dStatus = riderStatus(rider);
  const shopHref = mStatus === 'active' ? '/m/merchant/orders' : '/m/merchant/shops';
  const deliveryHref = dStatus === 'active' ? '/m/rider/home' : '/m/rider/signup';

  return [
    {
      id: 'shop',
      status: mStatus,
      label: 'จัดการร้าน',
      detail: mStatus === 'active'
        ? `${(dash?.accessible_shops || []).length} ร้าน`
        : 'อาหาร · Marketplace',
      href: shopHref,
      cta: mStatus === 'active' ? 'เปิดหลังบ้าน' : mStatus === 'pending' ? 'ดูสถานะ' : 'เปิดร้านบน AQOND',
      icon: '🏪',
    },
    {
      id: 'delivery',
      status: dStatus,
      label: 'รับงานส่งของ',
      detail: 'อาหาร · พัสดุระยะใกล้',
      href: deliveryHref,
      cta: dStatus === 'active' ? 'ไปรอรับงาน' : dStatus === 'pending' ? 'รออนุมัติ' : 'เปิดใช้งานส่งของ',
      icon: '🛵',
    },
    {
      id: 'sell',
      status: 'none',
      label: 'ลงขายสินค้า',
      detail: 'Hermes AI ช่วยลง',
      href: '/m/sell',
      cta: 'ลงขายเลย',
      icon: '✨',
    },
    {
      id: 'messenger',
      status: 'none',
      label: 'Messenger / คนขับ',
      detail: 'จุด A→B · รถสาธารณะ',
      href: `${mobileUrl}/#/transport`,
      cta: 'เปิดในแอปมือถือ',
      icon: '📱',
      external: true,
    },
  ];
}

export function capabilityStatusLabel(status: CapabilityStatus): string {
  switch (status) {
    case 'active':
      return 'เปิดใช้งานแล้ว';
    case 'pending':
      return 'รออนุมัติ';
    case 'none':
      return 'ยังไม่เปิด';
    default:
      return '';
  }
}
