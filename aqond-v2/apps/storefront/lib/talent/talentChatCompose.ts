import type { BookingItem } from '@/lib/services/bookingTypes';
import type { MatchJob } from '@/lib/services/matchJobTypes';
import { filterMyMatchJobs } from '@/lib/services/myMatchJobsFilter';
import {
  isTalentNotificationUnread,
  talentNotificationCategory,
} from '@/lib/talent/talentNotificationPresentation';
import { talentNotificationHref } from '@/lib/talent/talentTodayLinks';
import { TALENT_CHAT_LINKS } from '@/lib/talent/talentChatLinks';
import type {
  TalentChatConversation,
  TalentChatFilterId,
  TalentChatLaneId,
} from '@/lib/talent/talentChatTypes';
import type { TalentNotificationRow, TalentTodayRaw } from '@/lib/talent/talentTodaySources';

export type TalentShopChatThread = {
  shop_id: string;
  last_message: string;
  last_at: string;
};

export type TalentChatRaw = TalentTodayRaw & {
  shopThreads: TalentShopChatThread[];
};

function parseTime(iso?: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function blob(parts: (string | null | undefined)[]): string {
  return parts
    .filter((p) => p != null && String(p).trim())
    .join(' ')
    .toLowerCase();
}

function makeConversation(
  partial: Omit<TalentChatConversation, 'searchText'> & { keywords?: string[] },
): TalentChatConversation {
  return {
    ...partial,
    searchText: blob([
      partial.title,
      partial.preview,
      partial.lane,
      ...(partial.keywords ?? []),
    ]),
  };
}

function matchConversations(jobs: MatchJob[], userId: string): TalentChatConversation[] {
  return filterMyMatchJobs(jobs, 'working', userId).map((j) =>
    makeConversation({
      id: `match-${j.id}`,
      lane: 'match',
      title: j.title,
      preview: j.category,
      href: TALENT_CHAT_LINKS.matchJob(j.id),
      icon: '⚡',
      updatedAt: j.datetime || j.created_at,
      updatedAtMs: parseTime(j.datetime || j.created_at) || Date.now(),
      unread: false,
      keywords: [j.status, 'match', 'chat'],
    }),
  );
}

function bookingConversations(incoming: BookingItem[], mine: BookingItem[]): TalentChatConversation[] {
  const seen = new Set<string>();
  const out: TalentChatConversation[] = [];
  for (const b of [...incoming, ...mine]) {
    if (!b?.id || seen.has(b.id)) continue;
    seen.add(b.id);
    const pending = String(b.status || '').toLowerCase() === 'pending';
    out.push(
      makeConversation({
        id: `booking-${b.id}`,
        lane: 'booking',
        title: b.talent_name || b.booker_name || 'Booking',
        preview: `${b.status || 'booking'} · ${b.start_time || ''}`.trim(),
        href: TALENT_CHAT_LINKS.bookingIncoming,
        icon: '📅',
        updatedAt: b.start_time || b.created_at,
        updatedAtMs: parseTime(b.start_time || b.created_at) || parseTime(b.created_at),
        unread: pending,
        keywords: [b.booker_name, b.talent_name, 'booking'],
      }),
    );
  }
  return out.filter((c) => c.updatedAtMs > 0);
}

function merchantConversations(threads: TalentShopChatThread[]): TalentChatConversation[] {
  return threads.map((t) =>
    makeConversation({
      id: `shop-${t.shop_id}`,
      lane: 'merchant',
      title: t.shop_id,
      preview: t.last_message,
      href: TALENT_CHAT_LINKS.merchantThread(t.shop_id),
      icon: '🛍️',
      updatedAt: t.last_at,
      updatedAtMs: parseTime(t.last_at) || Date.now(),
      unread: false,
      keywords: ['merchant', 'shop', t.shop_id],
    }),
  );
}

function notificationChatConversations(rows: TalentNotificationRow[]): TalentChatConversation[] {
  return rows
    .filter((n) => talentNotificationCategory(n) === 'chat')
    .map((n, i) => {
      const href = talentNotificationHref(n);
      if (!href) return null;
      const unread = isTalentNotificationUnread(n);
      return makeConversation({
        id: `notif-chat-${n.id || i}`,
        lane: href.includes('/booking') ? 'booking' : href.includes('/match') ? 'match' : 'support',
        title: n.title || 'แชท',
        preview: n.message,
        href,
        icon: '💬',
        updatedAt: n.sentAt || n.created_at,
        updatedAtMs: parseTime(n.sentAt || n.created_at) || Date.now(),
        unread,
        keywords: [n.message, 'chat', 'notification'],
      });
    })
    .filter((c): c is TalentChatConversation => c != null);
}

function supportPlaceholder(): TalentChatConversation[] {
  return [
    makeConversation({
      id: 'support-hub',
      lane: 'support',
      title: 'ศูนย์ช่วยเหลือ AQOND',
      preview: 'support@aqond.com · ไม่รวม chat backend',
      href: TALENT_CHAT_LINKS.support,
      icon: '🆘',
      updatedAt: undefined,
      updatedAtMs: 0,
      unread: false,
      keywords: ['support', 'help'],
    }),
  ];
}

/** Compose chat rows from existing fetches — no message migration */
export function composeTalentChatConversations(raw: TalentChatRaw, userId: string): TalentChatConversation[] {
  const merged = [
    ...matchConversations(raw.matchJobs, userId),
    ...bookingConversations(raw.incomingBookings, raw.myBookings),
    ...merchantConversations(raw.shopThreads),
    ...notificationChatConversations(raw.notifications),
    ...supportPlaceholder(),
  ];

  const byId = new Map<string, TalentChatConversation>();
  for (const c of merged) {
    const prev = byId.get(c.id);
    if (!prev || c.updatedAtMs > prev.updatedAtMs) byId.set(c.id, c);
  }

  return [...byId.values()].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

export function filterTalentChatConversations(
  items: TalentChatConversation[],
  query: string,
  laneFilter: TalentChatFilterId,
): TalentChatConversation[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (laneFilter === 'unread' && !item.unread) return false;
    if (laneFilter !== 'all' && laneFilter !== 'unread' && item.lane !== laneFilter) return false;
    if (!q) return true;
    return item.searchText.includes(q) || item.title.toLowerCase().includes(q);
  });
}

export function countTalentChatUnread(items: TalentChatConversation[]): number {
  return items.filter((i) => i.unread).length;
}

export function recentTalentChatConversations(
  items: TalentChatConversation[],
  limit = 12,
): TalentChatConversation[] {
  return items.filter((i) => i.lane !== 'support' || i.id !== 'support-hub').slice(0, limit);
}

export function conversationsByLane(
  items: TalentChatConversation[],
  lane: TalentChatLaneId,
): TalentChatConversation[] {
  return items.filter((i) => i.lane === lane);
}
