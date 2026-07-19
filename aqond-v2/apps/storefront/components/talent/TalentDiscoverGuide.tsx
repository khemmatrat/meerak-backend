'use client';

import Link from 'next/link';
import { TALENT_PLATFORM_ENTRIES } from '@/lib/talent/talentDiscoverability';

type Props = {
  title?: string;
  description?: string;
};

/** Platform hub guide — helps guests find Talent from governed AQOND entry points */
export function TalentDiscoverGuide({
  title = 'หา Talent Workspace ได้จาก',
  description = 'ไม่ต้องพิมพ์ URL — เข้าผ่านศูนย์ AQOND ด้านล่าง',
}: Props) {
  return (
    <section className="tt-talent-discover-guide" aria-label={title}>
      <h3>{title}</h3>
      {description ? <p className="tt-hint">{description}</p> : null}
      <ul className="tt-talent-discover-guide-list">
        {TALENT_PLATFORM_ENTRIES.map((entry) => (
          <li key={entry.id}>
            <Link href={entry.href} className="tt-talent-discover-guide-card">
              <span className="tt-talent-discover-guide-icon" aria-hidden>
                {entry.icon}
              </span>
              <span>
                <strong>{entry.label}</strong>
                <small>{entry.description}</small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
