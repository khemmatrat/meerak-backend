'use client';

import { StatusChip } from '@aqond/ui';
import { useTalentRole, useTalentRoleMeta } from '@/lib/talent/TalentRoleContext';
import { TALENT_ROLE_META } from '@/lib/talent/talentRoleTypes';

type Props = {
  compact?: boolean;
};

export function TalentRoleBadge({ compact }: Props) {
  const { activeRole } = useTalentRole();
  const meta = TALENT_ROLE_META[activeRole];
  const tone =
    meta.tone === 'success'
      ? 'success'
      : meta.tone === 'warning'
        ? 'warning'
        : meta.tone === 'premium'
          ? 'active'
          : meta.tone === 'primary'
            ? 'pending'
            : 'default';

  return (
    <StatusChip tone={tone} className={`tt-talent-role-badge${compact ? ' tt-talent-role-badge--compact' : ''}`}>
      <span aria-hidden>{meta.icon}</span>
      <span>{compact ? meta.shortLabel : meta.label}</span>
    </StatusChip>
  );
}
