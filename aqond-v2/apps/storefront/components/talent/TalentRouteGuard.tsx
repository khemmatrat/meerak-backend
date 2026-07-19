'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useTalentRole } from '@/lib/talent/TalentRoleContext';
import {
  canAccessTalentRoute,
  isTalentLoginRequiredPath,
  isTalentSensitivePath,
  talentPermissionForPath,
} from '@/lib/talent/talentRolePermissions';

type GuardStatus = 'checking' | 'allowed' | 'redirecting';

function resolveGuardDecision(
  pathname: string,
  loggedIn: boolean,
  activeRole: ReturnType<typeof useTalentRole>['activeRole'],
): { status: GuardStatus; target?: string } {
  if (!pathname.startsWith('/m/talent')) {
    return { status: 'allowed' };
  }

  const permission = talentPermissionForPath(pathname);
  if (!permission) {
    return { status: 'allowed' };
  }

  if (!loggedIn && isTalentLoginRequiredPath(pathname)) {
    return {
      status: 'redirecting',
      target: `/m/login?next=${encodeURIComponent(pathname)}`,
    };
  }

  if (!canAccessTalentRoute(activeRole, pathname)) {
    if (!loggedIn && isTalentSensitivePath(pathname)) {
      return {
        status: 'redirecting',
        target: `/m/login?next=${encodeURIComponent(pathname)}`,
      };
    }
    return {
      status: 'redirecting',
      target: '/m/talent?access=denied',
    };
  }

  return { status: 'allowed' };
}

export function TalentRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { auth } = useAuth();
  const { activeRole } = useTalentRole();
  const loggedIn = !!auth?.userId;

  const decision = useMemo(
    () => resolveGuardDecision(pathname, loggedIn, activeRole),
    [pathname, loggedIn, activeRole],
  );

  const [status, setStatus] = useState<GuardStatus>('checking');

  useEffect(() => {
    if (decision.status === 'redirecting' && decision.target) {
      setStatus('redirecting');
      router.replace(decision.target);
      return;
    }
    setStatus('allowed');
  }, [decision, router]);

  if (status !== 'allowed') {
    return null;
  }

  return <>{children}</>;
}
