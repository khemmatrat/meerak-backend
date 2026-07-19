'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/lib/auth';
import {
  TALENT_ROLE_STORAGE_KEY,
  TALENT_ROLE_META,
  type TalentRoleId,
  type TalentRoleSignals,
} from '@/lib/talent/talentRoleTypes';
import {
  buildTalentRoleSignals,
  coerceTalentRole,
  defaultTalentRoleForSignals,
  resolveAvailableTalentRoles,
} from '@/lib/talent/talentRoleResolver';
import { filterTalentNavForRole, talentHasPermission } from '@/lib/talent/talentRolePermissions';
import type { TalentNavItem } from '@/lib/talent/talentNavConfig';
import type { TalentPermission } from '@/lib/talent/talentRoleTypes';

type TalentRoleContextValue = {
  activeRole: TalentRoleId;
  availableRoles: TalentRoleId[];
  signals: TalentRoleSignals;
  setActiveRole: (role: TalentRoleId) => void;
  navItems: TalentNavItem[];
  can: (permission: TalentPermission) => boolean;
};

const TalentRoleContext = createContext<TalentRoleContextValue | null>(null);

function readStoredRole(): TalentRoleId | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(TALENT_ROLE_STORAGE_KEY);
    return raw as TalentRoleId | null;
  } catch {
    return null;
  }
}

function persistRole(role: TalentRoleId) {
  try {
    localStorage.setItem(TALENT_ROLE_STORAGE_KEY, role);
  } catch {
    /* ignore */
  }
}

export function TalentRoleProvider({ children }: { children: ReactNode }) {
  const { auth, user } = useAuth();
  const loggedIn = !!auth?.userId;
  const signals = useMemo(
    () => buildTalentRoleSignals(loggedIn, user, auth?.userId),
    [loggedIn, user, auth?.userId],
  );
  const availableRoles = useMemo(() => resolveAvailableTalentRoles(signals), [signals]);
  const [activeRole, setActiveRoleState] = useState<TalentRoleId>(() =>
    defaultTalentRoleForSignals(signals, availableRoles),
  );

  useEffect(() => {
    const stored = readStoredRole();
    const next = coerceTalentRole(stored, availableRoles);
    setActiveRoleState(next);
  }, [availableRoles.join(',')]);

  const setActiveRole = useCallback(
    (role: TalentRoleId) => {
      if (!availableRoles.includes(role)) return;
      setActiveRoleState(role);
      persistRole(role);
    },
    [availableRoles],
  );

  const navItems = useMemo(() => filterTalentNavForRole(activeRole), [activeRole]);

  const can = useCallback(
    (permission: TalentPermission) => talentHasPermission(activeRole, permission),
    [activeRole],
  );

  const value = useMemo(
    () => ({
      activeRole,
      availableRoles,
      signals,
      setActiveRole,
      navItems,
      can,
    }),
    [activeRole, availableRoles, signals, setActiveRole, navItems, can],
  );

  return <TalentRoleContext.Provider value={value}>{children}</TalentRoleContext.Provider>;
}

export function useTalentRole() {
  const ctx = useContext(TalentRoleContext);
  if (!ctx) throw new Error('useTalentRole outside TalentRoleProvider');
  return ctx;
}
