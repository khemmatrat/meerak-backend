const TTL_SEC = parseInt(process.env.ADS_SLOT_CACHE_TTL_SEC || '90', 10);

const STALE_SEC = parseInt(process.env.ADS_SLOT_CACHE_STALE_SEC || '300', 10);

const KEY_PREFIX = 'ads_slots:';



function cacheKey(viewerKey, surface, sessionId) {

  const sess = sessionId || 'default';

  return `${KEY_PREFIX}${viewerKey}:${surface}:${sess}`;

}



async function readCacheEntry(redisClient, viewerKey, surface, sessionId) {

  if (!redisClient) return null;

  try {

    const raw = await redisClient.get(cacheKey(viewerKey, surface, sessionId));

    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed?.slots)) return null;

    return { slots: parsed.slots, cachedAt: parsed.cachedAt || 0 };

  } catch {

    return null;

  }

}



export async function getCachedAdSlots(redisClient, viewerKey, surface, sessionId) {

  const entry = await readCacheEntry(redisClient, viewerKey, surface, sessionId);

  return entry?.slots || null;

}



export async function getStaleCachedAdSlots(

  redisClient,

  viewerKey,

  surface,

  sessionId,

  maxStaleSec = STALE_SEC,

) {

  const entry = await readCacheEntry(redisClient, viewerKey, surface, sessionId);

  if (!entry?.slots?.length) return null;

  if (Date.now() - entry.cachedAt > maxStaleSec * 1000) return null;

  return entry.slots;

}



export async function setCachedAdSlots(redisClient, viewerKey, surface, sessionId, slots) {

  if (!redisClient) return;

  try {

    await redisClient.setEx(

      cacheKey(viewerKey, surface, sessionId),

      TTL_SEC,

      JSON.stringify({ slots, cachedAt: Date.now() }),

    );

  } catch (e) {

    console.warn('[adsSlotCache] set failed:', e?.message);

  }

}



export async function warmAdSlots(redisClient, viewerKey, surface, sessionId, fetchFn) {

  if (!redisClient) {

    try {

      const data = await fetchFn();

      return data?.slots || [];

    } catch (e) {

      console.warn('[adsSlotCache] fetch without redis failed:', e?.message);

      return [];

    }

  }

  const existing = await getCachedAdSlots(redisClient, viewerKey, surface, sessionId);

  if (existing?.length) return existing;

  try {

    const data = await fetchFn();

    const slots = data?.slots || [];

    if (slots.length) {

      await setCachedAdSlots(redisClient, viewerKey, surface, sessionId, slots);

    }

    return slots;

  } catch (e) {

    const stale = await getStaleCachedAdSlots(redisClient, viewerKey, surface, sessionId);

    if (stale?.length) {

      console.warn('[adsSlotCache] serving stale slots after fetch failure:', e?.message);

      return stale;

    }

    console.warn('[adsSlotCache] warm failed:', e?.message);

    return [];

  }

}



/** Resolve ad slots — uses Redis cache when available, stale-while-revalidate on bridge failure. */

export async function resolveAdSlots(redisClient, viewerKey, surface, sessionId, fetchFn) {

  return warmAdSlots(redisClient, viewerKey, surface, sessionId, fetchFn);

}



/** Fire-and-forget refresh after feed response */

export function refreshAdSlotsAsync(redisClient, viewerKey, surface, sessionId, fetchFn) {

  if (!redisClient) return;

  setImmediate(() => {

    fetchFn()

      .then((data) => {

        const slots = data?.slots || [];

        if (slots.length) {

          return setCachedAdSlots(redisClient, viewerKey, surface, sessionId, slots);

        }

      })

      .catch((e) => console.warn('[adsSlotCache] async refresh:', e?.message));

  });

}



export { TTL_SEC as ADS_SLOT_CACHE_TTL_SEC, STALE_SEC as ADS_SLOT_CACHE_STALE_SEC };

