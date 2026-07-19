'use client';

import Link from 'next/link';
import { useState } from 'react';
import { StatusChip } from '@aqond/ui';
import { NotificationEmpty } from '@/components/talent/notifications/NotificationEmpty';
import { NotificationFilter } from '@/components/talent/notifications/NotificationFilter';
import { NotificationItem } from '@/components/talent/notifications/NotificationItem';
import { NotificationSkeleton } from '@/components/talent/notifications/NotificationSkeleton';
import { TalentGovernanceNotice } from '@/components/talent/TalentGovernanceNotice';
import { useTalentNotifications } from '@/hooks/talent/useTalentNotifications';
import { TALENT_GOVERNANCE_COPY } from '@/lib/talent/talentReleaseGovernance';
import {
  TALENT_NOTIFICATION_GROUP_LABELS,
  type TalentNotificationFilterId,
  type TalentNotificationGroupId,
} from '@/lib/talent/talentNotificationPresentation';

const GROUP_ORDER: TalentNotificationGroupId[] = ['today', 'yesterday', 'older'];

export function NotificationCenter() {
  const [filter, setFilter] = useState<TalentNotificationFilterId>('all');
  const { loading, error, filtered, grouped, loggedIn, reload } = useTalentNotifications(filter);

  const hasItems = filtered.length > 0;

  return (
    <div className="tt-talent-page tt-talent-notif-center" data-talent-notifications>
      <header className="tt-talent-page-head">
        <Link href="/m/talent" className="tt-talent-notif-back" aria-label="กลับ Today">
          ←
        </Link>
        <span className="tt-talent-page-icon" aria-hidden>
          🔔
        </span>
        <div>
          <p className="tt-talent-page-module">Inbox · TOS-5</p>
          <h2 className="tt-talent-page-title">Notification Center</h2>
          <StatusChip tone="pending">Read-only · no mutation</StatusChip>
        </div>
        <button
          type="button"
          className="tt-talent-today-refresh"
          onClick={() => void reload()}
          aria-label="รีเฟรช"
          disabled={loading}
        >
          ↻
        </button>
      </header>

      <NotificationFilter active={filter} onChange={setFilter} />

      <TalentGovernanceNotice message={TALENT_GOVERNANCE_COPY.notificationInboxNote} tone="info" compact />

      {loading ? (
        <NotificationSkeleton />
      ) : !loggedIn ? (
        <>
          <NotificationEmpty filter={filter} loggedIn={false} />
          <Link href="/m/login?next=/m/talent/notifications" className="tt-talent-today-login">
            <span>🔑</span>
            <div>
              <strong>เข้าสู่ระบบ</strong>
              <p className="tt-hint">ดูแจ้งเตือนล่าสุดจากบัญชีของคุณ</p>
            </div>
          </Link>
        </>
      ) : error || !hasItems ? (
        <NotificationEmpty filter={filter} loggedIn={loggedIn} error={error} />
      ) : (
        <div className="tt-talent-notif-groups">
          {GROUP_ORDER.map((groupId) => {
            const rows = grouped[groupId];
            if (!rows.length) return null;
            return (
              <section key={groupId} className="tt-talent-notif-group" aria-label={TALENT_NOTIFICATION_GROUP_LABELS[groupId]}>
                <h3 className="tt-talent-notif-group-title">{TALENT_NOTIFICATION_GROUP_LABELS[groupId]}</h3>
                <ul className="tt-talent-notif-list">
                  {rows.map((n, i) => (
                    <NotificationItem key={n.id || `${groupId}-${i}`} notification={n} index={i} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <p className="tt-talent-shell-badge">
        Talent OS Notification Center · /api/talent/read/notifications/latest · TOS-5
      </p>
    </div>
  );
}
