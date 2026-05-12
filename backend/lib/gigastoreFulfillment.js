/**
 * GigaStore fulfillment — mock by default; live API when GIGASTORE_USE_LIVE=1 and credentials set.
 *
 * Live store (แนะนำ): ไม่ต้องตั้ง SKU ใน .env — แคตตาล็อกใช้ `item.id` (UUID) จาก inventory API
 * เป็น `sku` ทั้งใน GET packages และ POST purchase (แอปส่ง UUID กลับมาเหมือนที่ได้จาก API)
 *
 * GIGASTORE_SKU_MAP_JSON — ทางเลือกเท่านั้น: แมปรหัสเก่า (เช่น GS-TH-EMRG-*) → inventory UUID
 * ถ้ายังไม่ได้ย้ายแคตตาล็อกให้ใช้ UUID ล้วน
 */
import QRCode from 'qrcode';
import {
  gigastoreFulfillOrder as mockFulfill,
  findMockSku,
} from './gigastoreMock.js';
import { getInventory, registerActivation } from './gigastoreClient.js';

export { findMockSku, GIGASTORE_MOCK_CATALOG } from './gigastoreMock.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let inventoryCache = { data: null, at: 0 };
const INV_TTL_MS = 60_000;

export function isGigastoreLive() {
  return (
    process.env.GIGASTORE_USE_LIVE === '1' &&
    !!(process.env.GIGASTORE_CLIENT_ID || '').trim() &&
    !!(process.env.GIGASTORE_CLIENT_SECRET || '').trim()
  );
}

/** แมป legacy เท่านั้น — live ปกติใช้ UUID จาก inventory เป็น sku โดยตรง */
function parseSkuMap() {
  const raw = process.env.GIGASTORE_SKU_MAP_JSON || '{}';
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function thbPerUsd() {
  const v = Number(process.env.GIGASTORE_THB_PER_USD || 36);
  return v > 0 ? v : 36;
}

/**
 * Retail price from GigaStore (usually USD) → our base THB for wallet math.
 */
export function retailToBaseThb(item) {
  const prices = item?.retailPrices || [];
  const usd = prices.find((p) => p.currencyCode === 'USD');
  const thb = prices.find((p) => p.currencyCode === 'THB');
  const pick = thb || usd || prices[0];
  if (!pick) return 0;
  const v = Number(pick.priceValue);
  if (pick.currencyCode === 'THB') return round2(Math.max(0, v));
  return round2(Math.max(0, v * thbPerUsd()));
}

function normalizeDataGb(item) {
  const u = (item?.sizeUnit || '').toString().toUpperCase();
  const val = Number(item?.sizeValue);
  if (!Number.isFinite(val) || val <= 0) return 0;
  if (u === 'GB') return round2(val);
  if (u === 'MB') return round2(val / 1024);
  return round2(val);
}

/** Short product blurb from portal inventory when available */
function pickInventoryNotes(item) {
  if (!item || typeof item !== 'object') return '';
  const raw =
    item.description ||
    item.shortDescription ||
    item.longDescription ||
    item.notes ||
    '';
  const s = String(raw).trim();
  if (!s) return '';
  return s.length > 600 ? `${s.slice(0, 597)}…` : s;
}

function normalizeValidityDays(item) {
  const u = (item?.validityUnit || '').toString().toLowerCase();
  const val = Number(item?.validitySize);
  if (!Number.isFinite(val) || val <= 0) return 0;
  if (u === 'days' || u === 'day') return Math.round(val);
  if (u === 'hours' || u === 'hour') return Math.max(1, Math.ceil(val / 24));
  if (u === 'years' || u === 'year') return Math.round(val * 365);
  return Math.round(val);
}

async function getCachedInventory() {
  const now = Date.now();
  if (inventoryCache.data && now - inventoryCache.at < INV_TTL_MS) {
    return inventoryCache.data;
  }
  const data = await getInventory();
  inventoryCache = { data, at: now };
  return data;
}

function filterInventoryItems(items) {
  const filter = (process.env.GIGASTORE_INVENTORY_COUNTRY_SET || '').trim();
  if (!filter) return items;
  const out = items.filter((i) => String(i.countrySet || '') === filter);
  if (items.length > 0 && out.length === 0) {
    console.warn(
      `[gigastore] GIGASTORE_INVENTORY_COUNTRY_SET="${filter}" removed all ${items.length} inventory rows — check portal countrySet or clear the env to show all.`
    );
  }
  return out;
}

/**
 * Rows for GET /api/v1/telecom/esim-packages when live.
 * @returns {Promise<Array<{ sku: string, name: string, region: string, validityDays: number, dataGb: number, basePrice: number }>>}
 */
export async function getEsimCatalogPackagesFromInventory() {
  const inv = await getCachedInventory();
  let items = inv.items || [];
  items = filterInventoryItems(items);
  return items.map((item) => ({
    sku: item.id,
    name: item.name || 'eSIM',
    region: item.countrySet || '—',
    validityDays: normalizeValidityDays(item),
    dataGb: normalizeDataGb(item),
    basePrice: retailToBaseThb(item),
    notes: pickInventoryNotes(item),
  }));
}

/**
 * Resolve product for wallet charge + fulfillment (live or mock).
 * @returns {Promise<{ sku: string, name: string, region: string, validityDays: number, dataGb: number, basePrice: number, inventoryItemId: string|null }|null>}
 */
export async function resolveEsimProductForPurchase(sku) {
  const key = (sku || '').toString().trim();
  if (!key) return null;

  if (!isGigastoreLive()) {
    const p = findMockSku(key);
    return p
      ? {
          sku: p.sku,
          name: p.name,
          region: p.region,
          validityDays: p.validityDays,
          dataGb: p.dataGb,
          basePrice: p.basePrice,
          inventoryItemId: null,
        }
      : null;
  }

  const inv = await getCachedInventory();
  const items = inv.items || [];
  const map = parseSkuMap();
  let itemId = map[key] || null;
  if (!itemId && UUID_RE.test(key)) itemId = key;
  let item = itemId ? items.find((i) => i.id === itemId) : null;
  if (!item && map[key]) {
    item = items.find((i) => i.id === map[key]);
  }
  if (!item) return null;

  return {
    sku: item.id,
    name: item.name || 'eSIM',
    region: item.countrySet || '—',
    validityDays: normalizeValidityDays(item),
    dataGb: normalizeDataGb(item),
    basePrice: retailToBaseThb(item),
    inventoryItemId: item.id,
  };
}

/**
 * @param {object} ctx
 * @param {string} ctx.sku
 * @param {string} ctx.userId
 * @param {string} ctx.purchaseId
 * @param {string} [ctx.clientIp]
 * @param {string} [ctx.customerEmail]
 * @param {string} [ctx.userCountry] — ISO2, default TH
 */
export async function gigastoreFulfillOrder(ctx) {
  const { sku, userId, purchaseId, clientIp, customerEmail, userCountry } = ctx;

  if (!isGigastoreLive()) {
    return mockFulfill({ sku, userId, purchaseId });
  }

  const resolved = await resolveEsimProductForPurchase(sku);
  if (!resolved || !resolved.inventoryItemId) {
    const err = new Error('UNKNOWN_SKU');
    err.code = 'UNKNOWN_SKU';
    throw err;
  }
  const inventoryItemId = resolved.inventoryItemId;

  const ip = (clientIp || '127.0.0.1').replace(/^::ffff:/, '');
  const country = (userCountry || process.env.GIGASTORE_DEFAULT_USER_COUNTRY || 'TH')
    .toString()
    .trim()
    .slice(0, 2)
    .toUpperCase();

  const body = {
    inventoryItemId,
    metatag: `aqond_en:${purchaseId}:u:${userId}`,
    userIp: ip,
    userCountry: country,
    activationMode: (process.env.GIGASTORE_ACTIVATION_MODE || 'NOW').trim(),
  };
  if (customerEmail && String(customerEmail).includes('@')) {
    body.customerEmail = String(customerEmail).trim();
  }

  if (process.env.GIGASTORE_USE_EXPECTED_PRICE === '1') {
    try {
      const inv = await getCachedInventory();
      const item = (inv.items || []).find((i) => i.id === inventoryItemId);
      const retail =
        (item?.retailPrices || []).find((p) => p.currencyCode === 'USD') || item?.retailPrices?.[0];
      if (retail) body.expectedPrice = retail;
    } catch (e) {
      console.warn('[gigastore] optional expectedPrice skipped:', e?.message || e);
    }
  }

  const data = await registerActivation(body);
  if (data.status && data.status !== 'success') {
    const err = new Error(`GigaStore activation status: ${data.status}`);
    err.body = data;
    throw err;
  }

  const ep = data.esimProfile;
  const activationCode = ep?.activationCode ? String(ep.activationCode) : '';
  const orderRef = ep?.iccid
    ? String(ep.iccid)
    : data?.customer?.uid
      ? String(data.customer.uid)
      : `GS-${String(purchaseId).slice(0, 8)}`;

  let activationQrDataUrl = '';
  if (activationCode) {
    activationQrDataUrl = await QRCode.toDataURL(activationCode, { width: 280, margin: 2, errorCorrectionLevel: 'M' });
  }

  const activationPayload =
    activationCode ||
    (ep?.installationUrl ? String(ep.installationUrl) : JSON.stringify({ provider: 'gigastore', iccid: ep?.iccid }));

  return {
    orderRef,
    activationQrDataUrl: activationQrDataUrl || null,
    activationPayload,
    raw: {
      provider: 'gigastore',
      activatedItem: data.activatedItem,
      customer: data.customer,
      esimProfile: ep,
    },
  };
}
