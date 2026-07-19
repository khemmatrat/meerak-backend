'use client';

import type { ReactNode } from 'react';
import { TalentRoleProvider } from '@/lib/talent/TalentRoleContext';
import { TalentShell } from '@/components/talent/TalentShell';

export function TalentWorkspaceRoot({ children }: { children: ReactNode }) {
  return (
    <TalentRoleProvider>
      <TalentShell>{children}</TalentShell>
    </TalentRoleProvider>
  );
}
