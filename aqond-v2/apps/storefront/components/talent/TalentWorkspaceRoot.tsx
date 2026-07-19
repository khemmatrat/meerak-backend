'use client';

import type { ReactNode } from 'react';
import { TalentRoleProvider } from '@/lib/talent/TalentRoleContext';
import { TalentRouteGuard } from '@/components/talent/TalentRouteGuard';
import { TalentShell } from '@/components/talent/TalentShell';

export function TalentWorkspaceRoot({ children }: { children: ReactNode }) {
  return (
    <TalentRoleProvider>
      <TalentRouteGuard>
        <TalentShell>{children}</TalentShell>
      </TalentRouteGuard>
    </TalentRoleProvider>
  );
}
