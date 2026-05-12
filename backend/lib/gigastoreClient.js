/**
 * GigaStore REST client — https://docs.giga.store/api/getting-started
 * Env: GIGASTORE_API_BASE_URL (default https://api.giga.store), GIGASTORE_CLIENT_ID, GIGASTORE_CLIENT_SECRET
 */
const DEFAULT_BASE = 'https://api.giga.store';

function baseUrl() {
  return String(process.env.GIGASTORE_API_BASE_URL || DEFAULT_BASE)
    .trim()
    .replace(/\/$/, '');
}

let tokenCache = { accessToken: null, expiresAt: 0 };

/**
 * @returns {Promise<string>}
 */
export async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }
  const id = (process.env.GIGASTORE_CLIENT_ID || '').trim();
  const secret = (process.env.GIGASTORE_CLIENT_SECRET || '').trim();
  if (!id || !secret) {
    throw new Error('GIGASTORE_CLIENT_ID and GIGASTORE_CLIENT_SECRET are required for live GigaStore');
  }
  const auth = Buffer.from(`${id}:${secret}`, 'utf8').toString('base64');
  const res = await fetch(`${baseUrl()}/reseller/authenticate`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}` },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = {};
  }
  if (!res.ok) {
    const err = new Error(`GigaStore auth failed: ${res.status} ${text.slice(0, 500)}`);
    err.status = res.status;
    throw err;
  }
  if (!data.accessToken) {
    throw new Error('GigaStore auth response missing accessToken');
  }
  const expiresInMs = (Number(data.expiresIn) || 86_400) * 1000;
  tokenCache = {
    accessToken: data.accessToken,
    expiresAt: now + expiresInMs - 120_000,
  };
  return tokenCache.accessToken;
}

/**
 * @returns {Promise<{ items?: Array<Record<string, unknown>> }>}
 */
export async function getInventory() {
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl()}/gigastore/products/inventory`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`GigaStore inventory failed: ${res.status} ${text.slice(0, 500)}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/**
 * First-package activation — POST /gigastore/activations/register
 * @param {object} body — inventoryItemId, metatag, userIp, userCountry, optional customerEmail, expectedPrice, activationMode
 */
export async function registerActivation(body) {
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl()}/gigastore/activations/register`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(
      data?.message || data?.error || `GigaStore activation failed: ${res.status} ${String(text).slice(0, 400)}`
    );
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export function clearTokenCacheForTests() {
  tokenCache = { accessToken: null, expiresAt: 0 };
}
