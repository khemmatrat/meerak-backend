import type { ExpertCategory } from './bookingTypes';

export const EXPERT_CATEGORY_FILTERS: { id: ExpertCategory; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'party_guest', label: 'เพื่อนเที่ยว' },
  { id: 'beauty', label: 'Beauty & Salon' },
  { id: 'wellness', label: 'Wellness & Spa' },
  { id: 'chef', label: 'Chef' },
  { id: 'barber', label: 'Barber' },
  { id: 'tailor', label: 'Style' },
  { id: 'artist', label: 'Entertainment' },
];

/** UI categories that map to backend provider filter */
export function expertCategoryApiParam(cat: ExpertCategory): string | undefined {
  if (cat === 'all') return undefined;
  return cat;
}

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: 'รอยืนยัน',
  confirmed: 'ยืนยันแล้ว (รอมัดจำ)',
  cancelled: 'ยกเลิก',
  completed: 'เสร็จแล้ว',
  in_progress: 'กำลังให้บริการ',
};

export function bookingStatusLabel(status: string): string {
  return BOOKING_STATUS_LABELS[String(status || '').toLowerCase()] || status;
}

export function expertCategoryLabel(cat?: string | null): string {
  const found = EXPERT_CATEGORY_FILTERS.find((f) => f.id === cat);
  return found?.label || (cat || 'ทั่วไป').replace(/_/g, ' ');
}
