import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { weeklyClipLimit } from './config.js';
import {
  AD_TOKEN_PACKAGES,
  MIN_CUSTOM_TOPUP_THB,
  TOKENS_PER_VIDEO,
  tokenEconomicsSummary,
  tokensForCustomAmount,
  videosFromTokens,
} from './tokenConfig.js';

const DATA_DIR = path.join(process.cwd(), '.data', 'aivos', 'merchant-ad');
const WALLETS_FILE = path.join(DATA_DIR, 'token-wallets.json');

function weekKey(d = new Date()) {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function readWallets() {
  try {
    const raw = JSON.parse(await fs.readFile(WALLETS_FILE, 'utf8'));
    return raw.wallets || {};
  } catch {
    return {};
  }
}

async function writeWallets(wallets) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(WALLETS_FILE, JSON.stringify({ wallets }, null, 2), 'utf8');
}

async function getWallet(merchantId) {
  const wallets = await readWallets();
  if (!wallets[merchantId]) {
    wallets[merchantId] = { balance: 0, topups: [], updated_at: new Date().toISOString() };
    await writeWallets(wallets);
  }
  return wallets[merchantId];
}

export async function getTokenBalance(merchantId) {
  const w = await getWallet(merchantId);
  return Number(w.balance) || 0;
}

export async function getExtendedQuota(merchantId, weeklyQuota) {
  const tokens = await getTokenBalance(merchantId);
  const freeRemaining = weeklyQuota?.remaining ?? 0;
  const tokenVideos = videosFromTokens(tokens);
  const canGenerate = freeRemaining > 0 || tokens >= TOKENS_PER_VIDEO;
  let nextCharge = 'none';
  if (canGenerate) nextCharge = freeRemaining > 0 ? 'free_weekly' : 'tokens';

  return {
    ...weeklyQuota,
    tokens,
    tokens_per_video: TOKENS_PER_VIDEO,
    token_videos_available: tokenVideos,
    can_generate: canGenerate,
    next_charge: nextCharge,
    economics: tokenEconomicsSummary(),
  };
}

export async function resolveGenerateCharge(merchantId, weeklyQuota) {
  if (weeklyQuota.remaining > 0) {
    return { source: 'free_weekly', tokens_charged: 0 };
  }
  const balance = await getTokenBalance(merchantId);
  if (balance < TOKENS_PER_VIDEO) {
    const err = new Error('insufficient_tokens');
    err.code = 'MERCHANT_AD_INSUFFICIENT_TOKENS';
    err.details = {
      required: TOKENS_PER_VIDEO,
      balance,
      hint: 'เติมโทเค็นเพื่อสร้างวิดีโอเพิ่ม',
    };
    throw err;
  }
  return { source: 'tokens', tokens_charged: TOKENS_PER_VIDEO };
}

export async function deductTokens(merchantId, amount, meta = {}) {
  const wallets = await readWallets();
  const w = wallets[merchantId] || { balance: 0, topups: [] };
  const next = Math.max(0, (Number(w.balance) || 0) - amount);
  wallets[merchantId] = {
    ...w,
    balance: next,
    last_deduct: { amount, ...meta, at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  };
  await writeWallets(wallets);
  return next;
}

export async function topUpTokens(merchantId, { packageId, customThb, paymentRef } = {}) {
  let tokens = 0;
  let priceThb = 0;
  let packLabel = 'custom';

  if (packageId) {
    const pack = AD_TOKEN_PACKAGES.find((p) => p.id === packageId);
    if (!pack) {
      const err = new Error('invalid_package');
      err.code = 'MERCHANT_AD_INVALID_PACKAGE';
      throw err;
    }
    tokens = pack.tokens;
    priceThb = pack.price_thb;
    packLabel = pack.id;
  } else if (customThb != null) {
    priceThb = Math.floor(Number(customThb));
    if (priceThb < MIN_CUSTOM_TOPUP_THB) {
      const err = new Error('min_topup_99');
      err.code = 'MERCHANT_AD_MIN_TOPUP';
      err.details = { min_thb: MIN_CUSTOM_TOPUP_THB };
      throw err;
    }
    tokens = tokensForCustomAmount(priceThb);
    packLabel = 'custom';
  } else {
    const err = new Error('package_or_amount_required');
    err.code = 'MERCHANT_AD_TOPUP_INVALID';
    throw err;
  }

  const wallets = await readWallets();
  const w = wallets[merchantId] || { balance: 0, topups: [] };
  const entry = {
    id: `tu-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    package_id: packLabel,
    price_thb: priceThb,
    tokens,
    payment_ref: paymentRef || `dev-${Date.now()}`,
    at: new Date().toISOString(),
  };
  wallets[merchantId] = {
    balance: (Number(w.balance) || 0) + tokens,
    topups: [entry, ...(w.topups || [])].slice(0, 50),
    updated_at: new Date().toISOString(),
  };
  await writeWallets(wallets);

  return {
    ok: true,
    tokens_added: tokens,
    balance: wallets[merchantId].balance,
    price_thb: priceThb,
    videos_added: videosFromTokens(tokens),
    entry,
  };
}

export { AD_TOKEN_PACKAGES, TOKENS_PER_VIDEO };
