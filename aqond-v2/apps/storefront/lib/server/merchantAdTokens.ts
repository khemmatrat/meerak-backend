import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), '.data', 'dev', 'merchant-ad-tokens');
const WALLETS_FILE = path.join(DATA_DIR, 'wallets.json');

export const TOKENS_PER_VIDEO = 100;
export const MIN_CUSTOM_TOPUP_THB = 99;

export const AD_TOKEN_PACKAGES = [
  { id: 'p99', price_thb: 99, tokens: 100, badge: 'เริ่มต้น' },
  { id: 'p199', price_thb: 199, tokens: 220, badge: 'คุ้ม +10%' },
  { id: 'p399', price_thb: 399, tokens: 500, badge: 'ยอดนิยม +25%' },
  { id: 'p599', price_thb: 599, tokens: 800, badge: '+33%' },
  { id: 'p799', price_thb: 799, tokens: 1100, badge: '+38%' },
  { id: 'p999', price_thb: 999, tokens: 1500, badge: '+51%' },
  { id: 'p1299', price_thb: 1299, tokens: 2000, badge: 'สุดคุ้ม +54%' },
];

export function tokensForCustomAmount(thb: number) {
  const amount = Math.floor(thb);
  if (amount < MIN_CUSTOM_TOPUP_THB) return 0;
  return Math.floor((amount / 99) * 100);
}

export function videosFromTokens(tokens: number) {
  return Math.floor(tokens / TOKENS_PER_VIDEO);
}

export type AdTokenQuota = {
  week_key: string;
  limit: number;
  used: number;
  remaining: number;
  tokens: number;
  tokens_per_video: number;
  token_videos_available: number;
  can_generate: boolean;
  next_charge: 'free_weekly' | 'tokens' | 'none';
};

async function readWallets(): Promise<Record<string, { balance: number }>> {
  try {
    const raw = JSON.parse(await fs.readFile(WALLETS_FILE, 'utf8'));
    return raw.wallets || {};
  } catch {
    return {};
  }
}

async function writeWallets(wallets: Record<string, { balance: number }>) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(WALLETS_FILE, JSON.stringify({ wallets }, null, 2), 'utf8');
}

export async function getTokenBalance(merchantId: string) {
  const wallets = await readWallets();
  return Number(wallets[merchantId]?.balance) || 0;
}

export async function extendQuota(merchantId: string, weekly: { week_key: string; limit: number; used: number; remaining: number }): Promise<AdTokenQuota> {
  const tokens = await getTokenBalance(merchantId);
  const freeRemaining = weekly.remaining;
  const canGenerate = freeRemaining > 0 || tokens >= TOKENS_PER_VIDEO;
  return {
    ...weekly,
    tokens,
    tokens_per_video: TOKENS_PER_VIDEO,
    token_videos_available: videosFromTokens(tokens),
    can_generate: canGenerate,
    next_charge: !canGenerate ? 'none' : freeRemaining > 0 ? 'free_weekly' : 'tokens',
  };
}

export async function topUpTokensLocal(
  merchantId: string,
  opts: { packageId?: string; customThb?: number },
) {
  let tokens = 0;
  let priceThb = 0;
  if (opts.packageId) {
    const pack = AD_TOKEN_PACKAGES.find((p) => p.id === opts.packageId);
    if (!pack) throw new Error('invalid_package');
    tokens = pack.tokens;
    priceThb = pack.price_thb;
  } else if (opts.customThb != null) {
    priceThb = Math.floor(opts.customThb);
    if (priceThb < MIN_CUSTOM_TOPUP_THB) throw new Error('min_topup_99');
    tokens = tokensForCustomAmount(priceThb);
  } else {
    throw new Error('package_or_amount_required');
  }
  const wallets = await readWallets();
  const prev = Number(wallets[merchantId]?.balance) || 0;
  wallets[merchantId] = { balance: prev + tokens };
  await writeWallets(wallets);
  return { tokens_added: tokens, balance: prev + tokens, price_thb: priceThb };
}

export async function deductTokensLocal(merchantId: string, amount: number) {
  const wallets = await readWallets();
  const prev = Number(wallets[merchantId]?.balance) || 0;
  wallets[merchantId] = { balance: Math.max(0, prev - amount) };
  await writeWallets(wallets);
  return wallets[merchantId].balance;
}

export async function saveUploadedProductImage(merchantId: string, buffer: Buffer, ext = 'jpg') {
  const dir = path.join(process.cwd(), '.data', 'dev', 'merchant-ad-uploads', merchantId);
  await fs.mkdir(dir, { recursive: true });
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const filename = `${id}.${ext}`;
  await fs.writeFile(path.join(dir, filename), buffer);
  return `/api/merchant/ad-video/uploads/${merchantId}/${filename}`;
}
