import type { MeerakUser } from '@/lib/meerakAuth';
import { isTalentRoleHintsEnabled } from '@/lib/talent/talentReleaseGovernance';
import {
  TALENT_ROLES,
  type TalentRoleId,
  type TalentRoleSignals,
} from '@/lib/talent/talentRoleTypes';

const PRO_TIER_KEY = 'aqond_pro_tier_v1';
const PROVIDER_STATUS_KEY = 'aqond_talent_provider_status_v1';

/** Read optional client hints — keys shared with mobile where applicable */
export function readTalentRoleHints(): Pick<TalentRoleSignals, 'proTier' | 'providerStatus'> {
  if (typeof window === 'undefined' || !isTalentRoleHintsEnabled()) {
    return { proTier: null, providerStatus: null };
  }
  try {
    const proTier = localStorage.getItem(PRO_TIER_KEY);
    const providerStatus = localStorage.getItem(PROVIDER_STATUS_KEY);
    return { proTier, providerStatus };
  } catch {
    return { proTier: null, providerStatus: null };
  }
}

export function buildTalentRoleSignals(
  loggedIn: boolean,
  user: MeerakUser | null | undefined,
  userId?: string,
): TalentRoleSignals {
  const hints = readTalentRoleHints();
  return {
    loggedIn,
    userId: userId || user?.id,
    userRole: user?.role,
    proTier: hints.proTier,
    providerStatus: hints.providerStatus,
  };
}

function norm(s?: string | null): string {
  return String(s || '')
    .trim()
    .toLowerCase();
}

function isProviderSignal(signals: TalentRoleSignals): boolean {
  const role = norm(signals.userRole);
  if (role === 'provider' || role.includes('provider')) return true;
  const ps = norm(signals.providerStatus);
  return ps === 'verified_provider' || ps === 'provider';
}

function isEnterpriseSignal(signals: TalentRoleSignals): boolean {
  const role = norm(signals.userRole);
  if (role === 'enterprise') return true;
  return norm(signals.proTier) === 'enterprise';
}

/** Which workspace roles the user may switch to — no backend calls */
export function resolveAvailableTalentRoles(signals: TalentRoleSignals): TalentRoleId[] {
  if (!signals.loggedIn) return ['guest'];

  const roles = new Set<TalentRoleId>(['verified', 'employer', 'customer']);
  if (isProviderSignal(signals)) roles.add('provider');
  if (isEnterpriseSignal(signals)) roles.add('enterprise');
  return TALENT_ROLES.filter((r) => roles.has(r));
}

export function defaultTalentRoleForSignals(
  signals: TalentRoleSignals,
  available: TalentRoleId[],
): TalentRoleId {
  if (!signals.loggedIn) return 'guest';
  if (isProviderSignal(signals) && available.includes('provider')) return 'provider';
  if (isEnterpriseSignal(signals) && available.includes('enterprise')) return 'enterprise';
  return 'verified';
}

export function coerceTalentRole(
  role: string | null | undefined,
  available: TalentRoleId[],
): TalentRoleId {
  if (role && available.includes(role as TalentRoleId)) return role as TalentRoleId;
  return available[0] ?? 'guest';
}
