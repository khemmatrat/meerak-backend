/** TOS-8 Unified Chat — presentation types only */

export type TalentChatLaneId = 'booking' | 'match' | 'merchant' | 'support';

export type TalentChatFilterId = 'all' | 'unread' | TalentChatLaneId;

export type TalentChatHub = {
  id: TalentChatLaneId;
  label: string;
  description: string;
  href: string;
  icon: string;
};

export type TalentChatConversation = {
  id: string;
  lane: TalentChatLaneId;
  title: string;
  preview?: string;
  href: string;
  icon: string;
  updatedAt?: string;
  updatedAtMs: number;
  unread?: boolean;
  searchText: string;
};

export const TALENT_CHAT_HUBS: TalentChatHub[] = [
  {
    id: 'booking',
    label: 'Booking Chat',
    description: 'แชทการจอง · SSOT /m/services/booking',
    href: '/m/services/booking/mine',
    icon: '📅',
  },
  {
    id: 'match',
    label: 'Match Chat',
    description: 'แชทงาน Match · SSOT /m/services/match/:id',
    href: '/m/services/match/mine?tab=working',
    icon: '⚡',
  },
  {
    id: 'merchant',
    label: 'Merchant Chat',
    description: 'แชทร้านค้า · SSOT /m/chats',
    href: '/m/chats',
    icon: '🛍️',
  },
  {
    id: 'support',
    label: 'Support',
    description: 'ศูนย์ช่วยเหลือ · SSOT /m/account/settings/help',
    href: '/m/account/settings/help',
    icon: '🆘',
  },
];

export const TALENT_CHAT_FILTERS: { id: TalentChatFilterId; label: string; icon: string }[] = [
  { id: 'all', label: 'ทั้งหมด', icon: '💬' },
  { id: 'unread', label: 'ยังไม่อ่าน', icon: '🔵' },
  { id: 'booking', label: 'จอง', icon: '📅' },
  { id: 'match', label: 'Match', icon: '⚡' },
  { id: 'merchant', label: 'ร้านค้า', icon: '🛍️' },
  { id: 'support', label: 'Support', icon: '🆘' },
];

export const TALENT_CHAT_LANE_LABELS: Record<TalentChatLaneId, string> = {
  booking: 'Booking',
  match: 'Match',
  merchant: 'Merchant',
  support: 'Support',
};
