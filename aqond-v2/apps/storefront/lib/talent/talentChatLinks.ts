import {
  TALENT_TODAY_LINKS,
  talentMatchJobHref,
} from '@/lib/talent/talentTodayLinks';

/** Deep links to existing chat SSOT routes — do not merge chat services */
export const TALENT_CHAT_LINKS = {
  bookingHub: TALENT_TODAY_LINKS.bookingMine,
  bookingIncoming: TALENT_TODAY_LINKS.bookingIncoming,
  matchHub: TALENT_TODAY_LINKS.matchMine,
  matchJob: (jobId: string) => talentMatchJobHref(jobId),
  merchantHub: '/m/chats',
  merchantThread: (shopId: string) => `/m/chat/${encodeURIComponent(shopId)}`,
  support: '/m/account/settings/help',
  workspace: '/m/talent/chat',
} as const;
