import { readStoredAuth } from '@/lib/meerakAuth';
import { getOrCreateGuestId } from './guestStorage';
import { resolveIntentRedirect } from './intentRedirect';
import type { WizardDraft } from './wizardStorage';

export type SubmitWizardInput = WizardDraft & {
  completeWizard?: boolean;
};

export type SubmitWizardResult = {
  ok: boolean;
  redirectPath?: string;
  profile?: { wizardCompletedAt?: string | null };
  error?: string;
};

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const stored = readStoredAuth();
  if (stored?.token) h.Authorization = `Bearer ${stored.token}`;
  if (stored?.userId) h['X-User-Id'] = stored.userId;
  if (stored?.sessionId) h['X-Session-Id'] = stored.sessionId;
  return h;
}

export async function submitWizardPreferences(input: SubmitWizardInput): Promise<SubmitWizardResult> {
  const stored = readStoredAuth();
  const guestId = getOrCreateGuestId();
  const interests = input.interests || [];
  const body = {
    user_id: stored?.userId,
    guest_id: guestId,
    referral_source: input.referralSource,
    birth_date: input.birthDate || null,
    email: input.email || null,
    referral_code: input.referralCode || null,
    country: input.country || null,
    language: input.language || null,
    interests,
    primary_interest: interests[0] || null,
    complete_wizard: input.completeWizard !== false,
  };

  try {
    const res = await fetch('/api/experience/preferences', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || 'submit_failed' };
    }
    const primary = data.intents?.primary || interests[0];
    return {
      ok: true,
      redirectPath: data.redirectPath || resolveIntentRedirect(primary),
      profile: data.profile,
    };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

export async function postExperienceEvent(eventType: string, payload: Record<string, unknown> = {}) {
  const guestId = getOrCreateGuestId();
  const stored = readStoredAuth();
  try {
    await fetch('/api/experience/events', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        event_type: eventType,
        guest_id: guestId,
        user_id: stored?.userId,
        payload,
      }),
    });
  } catch {
    /* non-blocking */
  }
}

export async function completeTour(skipped = false) {
  const stored = readStoredAuth();
  try {
    const res = await fetch('/api/experience/tour', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        user_id: stored?.userId,
        skipped,
      }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, profile: data.profile as { tourCompletedAt?: string } | undefined };
  } catch {
    return { ok: false };
  }
}

export async function fetchJarvisBrief(surface = 'home') {
  try {
    const res = await fetch(`/api/experience/jarvis-brief?surface=${encodeURIComponent(surface)}`, {
      cache: 'no-store',
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    return data as {
      ok?: boolean;
      enabled?: boolean;
      proactive?: {
        id: string;
        message: string;
        priority?: number;
        action?: string;
        action_href?: string;
        product?: string;
      }[];
      top?: { id: string; message: string };
      tone?: string;
    };
  } catch {
    return null;
  }
}

export async function dismissJarvisBrief(briefId: string) {
  const stored = readStoredAuth();
  try {
    await fetch('/api/jarvis/brief-dismiss', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        brief_id: briefId,
        user_id: stored?.userId,
      }),
    });
  } catch {
    /* non-blocking */
  }
}
