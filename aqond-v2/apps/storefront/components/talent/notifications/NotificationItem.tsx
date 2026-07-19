import Link from 'next/link';
import {
  isTalentNotificationUnread,
  talentNotificationCategoryMeta,
} from '@/lib/talent/talentNotificationPresentation';
import { talentNotificationHref } from '@/lib/talent/talentTodayLinks';
import type { TalentNotificationRow } from '@/lib/talent/talentTodaySources';

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type Props = {
  notification: TalentNotificationRow;
  index: number;
};

/** Single notification row — deep link only, no mark-read */
export function NotificationItem({ notification, index }: Props) {
  const href = talentNotificationHref(notification);
  const meta = talentNotificationCategoryMeta(notification);
  const unread = isTalentNotificationUnread(notification);
  const key = notification.id || `notif-${index}`;
  const title = notification.title || 'แจ้งเตือน';
  const body = notification.message;
  const when = formatDateTime(notification.sentAt || notification.created_at);

  const content = (
    <>
      <div className="tt-talent-notif-item-top">
        <span className="tt-talent-notif-item-icon" aria-hidden>
          {meta.icon}
        </span>
        <div className="tt-talent-notif-item-head">
          <strong className={unread ? 'is-unread' : ''}>{title}</strong>
          <span className="tt-talent-notif-item-cat">{meta.label}</span>
        </div>
        {unread ? <span className="tt-talent-notif-unread-dot" aria-label="ยังไม่อ่าน" /> : null}
      </div>
      {body ? <p className="tt-talent-notif-item-msg">{body}</p> : null}
      <time className="tt-talent-notif-item-time" dateTime={notification.sentAt || notification.created_at}>
        {when}
      </time>
    </>
  );

  if (href) {
    return (
      <li className="tt-talent-notif-item">
        <Link href={href} className="tt-talent-notif-item-link">
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li className="tt-talent-notif-item">
      <div className="tt-talent-notif-item-link tt-talent-notif-item-link--static">{content}</div>
    </li>
  );
}
