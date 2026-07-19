/** TOS-6 Universal Search — presentation types only */

export type TalentSearchSourceId =
  | 'booking'
  | 'match'
  | 'board'
  | 'wallet'
  | 'reviews'
  | 'notifications'
  | 'services'
  | 'calendar';

export type TalentSearchFilterId = TalentSearchSourceId | 'all';

export type TalentSearchResult = {
  id: string;
  source: TalentSearchSourceId;
  title: string;
  subtitle?: string;
  href: string;
  icon: string;
  meta?: string;
  /** Precomputed lowercase blob for client-side match */
  searchText: string;
};

export type TalentSearchSuggestion = {
  id: string;
  label: string;
  query: string;
  filter: TalentSearchFilterId;
  icon: string;
};

export const TALENT_SEARCH_SOURCE_META: Record<
  TalentSearchSourceId,
  { label: string; icon: string }
> = {
  booking: { label: 'จอง', icon: '📅' },
  match: { label: 'Match', icon: '⚡' },
  board: { label: 'Board', icon: '💼' },
  wallet: { label: 'กระเป๋า', icon: '💰' },
  reviews: { label: 'รีวิว', icon: '⭐' },
  notifications: { label: 'แจ้งเตือน', icon: '🔔' },
  services: { label: 'Services', icon: '🛠️' },
  calendar: { label: 'ปฏิทิน', icon: '🗓️' },
};

export const TALENT_SEARCH_QUICK_FILTERS: { id: TalentSearchFilterId; label: string; icon: string }[] = [
  { id: 'all', label: 'ทั้งหมด', icon: '🔍' },
  { id: 'booking', label: 'จอง', icon: '📅' },
  { id: 'match', label: 'Match', icon: '⚡' },
  { id: 'board', label: 'Board', icon: '💼' },
  { id: 'wallet', label: 'กระเป๋า', icon: '💰' },
  { id: 'reviews', label: 'รีวิว', icon: '⭐' },
  { id: 'notifications', label: 'แจ้งเตือน', icon: '🔔' },
  { id: 'services', label: 'Services', icon: '🛠️' },
  { id: 'calendar', label: 'ปฏิทิน', icon: '🗓️' },
];

export const TALENT_SEARCH_SUGGESTED: TalentSearchSuggestion[] = [
  { id: 's-match', label: 'งาน Match กำลังทำ', query: 'match', filter: 'match', icon: '⚡' },
  { id: 's-board', label: 'ใบสมัคร Board', query: 'board', filter: 'board', icon: '💼' },
  { id: 's-booking', label: 'คิวจอง', query: 'booking', filter: 'booking', icon: '📅' },
  { id: 's-wallet', label: 'ยอดกระเป๋า', query: 'wallet', filter: 'wallet', icon: '💰' },
  { id: 's-review', label: 'รีวิวล่าสุด', query: 'review', filter: 'reviews', icon: '⭐' },
  { id: 's-notif', label: 'แจ้งเตือน', query: 'แจ้งเตือน', filter: 'notifications', icon: '🔔' },
  { id: 's-services', label: 'หา Services', query: 'services', filter: 'services', icon: '🛠️' },
  { id: 's-cal', label: 'ตารางวันนี้', query: 'calendar', filter: 'calendar', icon: '🗓️' },
];

export const TALENT_SEARCH_RECENT_KEY = 'aqond_talent_search_recent_v1';
export const TALENT_SEARCH_RECENT_MAX = 8;
