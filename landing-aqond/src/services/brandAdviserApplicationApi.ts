import { getBackendBaseUrl } from './landingLeadApi';

export type BrandAdviserApplicationPayload = {
  full_name: string;
  contact: string;
  primary_platform: 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'other';
  primary_profile_url: string;
  link_youtube?: string;
  link_tiktok?: string;
  link_instagram?: string;
  link_facebook?: string;
  follower_count_declared?: number | null;
  motivation?: string;
  read_rules_accepted: boolean;
};

export async function submitBrandAdviserApplication(
  payload: BrandAdviserApplicationPayload
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const api = getBackendBaseUrl();
  try {
    const res = await fetch(`${api}/api/public/brand-adviser-application`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `http_${res.status}` };
    }
    return { ok: true, id: data.id };
  } catch {
    return { ok: false, error: 'network' };
  }
}
