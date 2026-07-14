import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const COINS_FILE = path.join(process.cwd(), '.data', 'aqond-coins.json');

export type CoinLedgerType =
  | 'review_reward'
  | 'video_token_redeem'
  | 'promo'
  | 'admin_adjust';

export type CoinLedgerEntry = {
  id: string;
  user_id: string;
  amount: number;
  type: CoinLedgerType;
  reference_id?: string;
  reference_type?: string;
  label_th: string;
  created_at: string;
  balance_after: number;
};

export type CoinWallet = {
  user_id: string;
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  updated_at: string;
};

type CoinDb = {
  wallets: Record<string, CoinWallet>;
  ledger: CoinLedgerEntry[];
};

const VIDEO_TOKEN_RATE = 10;

export function videoTokenRate() {
  return VIDEO_TOKEN_RATE;
}

export function coinsToVideoTokens(coins: number) {
  return Math.floor(coins / VIDEO_TOKEN_RATE);
}

async function readDb(): Promise<CoinDb> {
  try {
    const data = JSON.parse(await fs.readFile(COINS_FILE, 'utf8'));
    return {
      wallets: data.wallets || {},
      ledger: data.ledger || [],
    };
  } catch {
    return { wallets: {}, ledger: [] };
  }
}

async function writeDb(db: CoinDb) {
  await fs.mkdir(path.dirname(COINS_FILE), { recursive: true });
  await fs.writeFile(COINS_FILE, JSON.stringify(db, null, 2));
}

function emptyWallet(userId: string): CoinWallet {
  return {
    user_id: userId,
    balance: 0,
    lifetime_earned: 0,
    lifetime_spent: 0,
    updated_at: new Date().toISOString(),
  };
}

export async function getCoinWallet(userId: string): Promise<CoinWallet> {
  const db = await readDb();
  return db.wallets[userId] || emptyWallet(userId);
}

export async function listCoinLedger(userId: string, limit = 20): Promise<CoinLedgerEntry[]> {
  const db = await readDb();
  return db.ledger
    .filter((e) => e.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

export async function creditCoins(input: {
  user_id: string;
  amount: number;
  type: CoinLedgerType;
  reference_id?: string;
  reference_type?: string;
  label_th: string;
}): Promise<{ wallet: CoinWallet; entry: CoinLedgerEntry }> {
  if (input.amount <= 0) throw new Error('invalid_amount');

  const db = await readDb();
  const wallet = db.wallets[input.user_id] || emptyWallet(input.user_id);
  wallet.balance += input.amount;
  wallet.lifetime_earned += input.amount;
  wallet.updated_at = new Date().toISOString();
  db.wallets[input.user_id] = wallet;

  const entry: CoinLedgerEntry = {
    id: `coin-${crypto.randomBytes(6).toString('hex')}`,
    user_id: input.user_id,
    amount: input.amount,
    type: input.type,
    reference_id: input.reference_id,
    reference_type: input.reference_type,
    label_th: input.label_th,
    created_at: new Date().toISOString(),
    balance_after: wallet.balance,
  };
  db.ledger.unshift(entry);
  await writeDb(db);
  return { wallet, entry };
}

export async function debitCoins(input: {
  user_id: string;
  amount: number;
  type: CoinLedgerType;
  reference_id?: string;
  reference_type?: string;
  label_th: string;
}): Promise<{ wallet: CoinWallet; entry: CoinLedgerEntry }> {
  if (input.amount <= 0) throw new Error('invalid_amount');

  const db = await readDb();
  const wallet = db.wallets[input.user_id] || emptyWallet(input.user_id);
  if (wallet.balance < input.amount) throw new Error('insufficient_coins');

  wallet.balance -= input.amount;
  wallet.lifetime_spent += input.amount;
  wallet.updated_at = new Date().toISOString();
  db.wallets[input.user_id] = wallet;

  const entry: CoinLedgerEntry = {
    id: `coin-${crypto.randomBytes(6).toString('hex')}`,
    user_id: input.user_id,
    amount: -input.amount,
    type: input.type,
    reference_id: input.reference_id,
    reference_type: input.reference_type,
    label_th: input.label_th,
    created_at: new Date().toISOString(),
    balance_after: wallet.balance,
  };
  db.ledger.unshift(entry);
  await writeDb(db);
  return { wallet, entry };
}

export async function findLedgerByReference(
  userId: string,
  referenceType: string,
  referenceId: string,
): Promise<CoinLedgerEntry | null> {
  const db = await readDb();
  return (
    db.ledger.find(
      (e) =>
        e.user_id === userId &&
        e.reference_type === referenceType &&
        e.reference_id === referenceId,
    ) || null
  );
}
