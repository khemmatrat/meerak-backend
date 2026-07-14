export type HandoffType = 'hand_to_me' | 'leave_at' | 'delegate';

export type DeliveryHandoff = {
  type: HandoffType;
  /** วางไว้ที่ไหน */
  leaveAtSpot?: string;
  /** ชื่อผู้รับต่อ */
  delegateName?: string;
  /** ตึก / ชั้น / ห้อง */
  delegateBuilding?: string;
  /** เบอร์ผู้รับต่อ */
  delegatePhone?: string;
  /** หมายเหตุเพิ่มถึงไรเดอร์ */
  extraNote?: string;
};

export const HANDOFF_OPTIONS: Array<{
  id: HandoffType;
  icon: string;
  label: string;
  hint: string;
}> = [
  { id: 'hand_to_me', icon: '🤝', label: 'รับถึงมือ', hint: 'ส่งตรงให้ผู้รับหน้าประตู' },
  { id: 'leave_at', icon: '📍', label: 'วางไว้จุดที่ระบุ', hint: 'วางไว้โต๊ะ รปภ. ล็obbies ฯลฯ' },
  { id: 'delegate', icon: '🏢', label: 'ส่งต่อให้คนอื่น', hint: 'มอบให้คนอื่นรับแทนที่ตึก/ชั้น' },
];

export function formatHandoffSummary(h: DeliveryHandoff): string {
  if (h.type === 'hand_to_me') {
    return 'รับถึงมือ — ส่งตรงให้ผู้รับ';
  }
  if (h.type === 'leave_at') {
    const spot = h.leaveAtSpot?.trim();
    return spot ? `วางไว้: ${spot}` : 'วางไว้จุดที่ระบุ';
  }
  const name = h.delegateName?.trim() || 'ผู้รับต่อ';
  const building = h.delegateBuilding?.trim();
  let line = `ส่งต่อให้ ${name}`;
  if (building) line += ` ที่ ${building}`;
  if (h.delegatePhone?.trim()) line += ` (โทร ${h.delegatePhone.trim()})`;
  return line;
}

export function formatHandoffForOrder(h: DeliveryHandoff): string {
  const parts = [formatHandoffSummary(h)];
  const extra = h.extraNote?.trim();
  if (extra) parts.push(extra);
  return parts.join(' · ');
}

export function validateHandoff(h: DeliveryHandoff): string {
  if (h.type === 'leave_at' && !h.leaveAtSpot?.trim()) {
    return 'ระบุจุดวางอาหาร เช่น โต๊ะหน้าประตู รปภ.';
  }
  if (h.type === 'delegate') {
    if (!h.delegateName?.trim()) return 'ระบุชื่อผู้รับต่อ';
    if (!h.delegateBuilding?.trim()) return 'ระบุตึก/ชั้น/ห้องที่ส่งต่อ';
  }
  return '';
}

export const DEFAULT_HANDOFF: DeliveryHandoff = { type: 'hand_to_me' };
