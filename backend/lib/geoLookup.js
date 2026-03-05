/**
 * IP-to-Geo lookup for Teleportation anomaly (5 ธงแดง)
 * Uses ip-api.com (free, no key, 45 req/min)
 * Returns { country, countryCode, region, regionName } for comparison
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const cache = new Map();

/**
 * Lookup geo for IP. Caches result.
 * @param {string} ip
 * @returns {Promise<{ country?: string; countryCode?: string; region?: string; regionName?: string } | null>}
 */
async function lookupIpGeo(ip) {
  if (!ip || ip === 'localhost' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { country: 'Local', region: 'Local', regionName: 'Local' };
  }
  const cached = cache.get(ip);
  if (cached && cached.expires > Date.now()) return cached.data;

  try {
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=country,countryCode,region,regionName`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === 'fail') return null;
    const result = {
      country: data.country || '',
      countryCode: data.countryCode || '',
      region: data.region || '',
      regionName: data.regionName || '',
    };
    cache.set(ip, { data: result, expires: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (e) {
    return null;
  }
}

/**
 * Check if two geo locations are "far" (different country or different province)
 */
function isGeoFar(a, b) {
  if (!a || !b) return false;
  if (a.country !== b.country) return true;
  const rA = (a.region || a.regionName || '').toLowerCase();
  const rB = (b.region || b.regionName || '').toLowerCase();
  if (rA && rB && rA !== rB) return true;
  return false;
}

export { lookupIpGeo, isGeoFar };
