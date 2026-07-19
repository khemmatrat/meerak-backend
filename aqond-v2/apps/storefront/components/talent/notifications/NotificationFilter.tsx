'use client';

import type { TalentNotificationFilterId } from '@/lib/talent/talentNotificationPresentation';
import { TALENT_NOTIFICATION_FILTERS } from '@/lib/talent/talentNotificationPresentation';

type Props = {
  active: TalentNotificationFilterId;
  onChange: (filter: TalentNotificationFilterId) => void;
};

/** Read-only filter chips — client presentation only */
export function NotificationFilter({ active, onChange }: Props) {
  return (
    <div className="tt-talent-notif-filters" role="tablist" aria-label="กรองแจ้งเตือน">
      {TALENT_NOTIFICATION_FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          role="tab"
          className={active === f.id ? 'active' : ''}
          aria-selected={active === f.id}
          onClick={() => onChange(f.id)}
        >
          <span aria-hidden>{f.icon}</span>
          <span>{f.label}</span>
        </button>
      ))}
    </div>
  );
}
