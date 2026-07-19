'use client';

import Link from 'next/link';
import { TALENT_SATELLITE_SHORTCUTS } from '@/lib/talent/talentDiscoverability';
import { useTalentRole } from '@/lib/talent/TalentRoleContext';

export function TalentSatelliteShortcuts() {
  const { can } = useTalentRole();
  const items = TALENT_SATELLITE_SHORTCUTS.filter((item) => can(item.permission));
  if (items.length === 0) return null;

  return (
    <nav className="tt-talent-satellite-row" aria-label="ทางลัด Workspace">
      {items.map((item) => (
        <Link key={item.id} href={item.href} className="tt-talent-satellite-chip">
          <span aria-hidden>{item.icon}</span>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
