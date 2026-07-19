import type { AuthState } from '@/lib/bff';
import { loadTalentSearchRaw } from '@/lib/talent/talentSearchSources';
import type { TalentChatRaw, TalentShopChatThread } from '@/lib/talent/talentChatCompose';

async function fetchShopChatThreads(userId: string | undefined): Promise<TalentShopChatThread[]> {
  if (!userId) return [];
  try {
    const res = await fetch(`/api/shop-chat/inbox?buyer_id=${encodeURIComponent(userId)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data?.threads) ? data.threads : [];
  } catch {
    return [];
  }
}

/** Parallel read — existing Today fetches + shop inbox API (no new contracts) */
export async function loadTalentChatRaw(
  auth: AuthState | null,
  userId: string | undefined,
): Promise<TalentChatRaw> {
  const base = await loadTalentSearchRaw(auth, userId);
  const shopThreads = auth?.userId ? await fetchShopChatThreads(userId) : [];
  return { ...base, shopThreads };
}
