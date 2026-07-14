import fs from 'node:fs/promises';
import path from 'node:path';

const INBOX_FILE = path.join(process.cwd(), '.data', 'merchant-return-inbox.json');

export type MerchantReturnNotice = {
  id: string;
  return_id: string;
  order_id: string;
  merchant_id: string;
  buyer_id: string;
  reason_code?: string;
  return_method?: string;
  detail?: string;
  state: string;
  inbox_status: 'unread' | 'read' | 'responded';
  merchant_response?: 'approved' | 'rejected';
  merchant_note?: string;
  created_at: string;
  updated_at: string;
};

type InboxDb = { notices: MerchantReturnNotice[] };

async function readDb(): Promise<InboxDb> {
  try {
    const raw = JSON.parse(await fs.readFile(INBOX_FILE, 'utf8'));
    return { notices: raw.notices || [] };
  } catch {
    return { notices: [] };
  }
}

async function writeDb(db: InboxDb) {
  await fs.mkdir(path.dirname(INBOX_FILE), { recursive: true });
  await fs.writeFile(INBOX_FILE, JSON.stringify(db, null, 2), 'utf8');
}

export async function upsertMerchantReturnNotice(
  input: Omit<MerchantReturnNotice, 'id' | 'inbox_status' | 'created_at' | 'updated_at'> & {
    id?: string;
    inbox_status?: MerchantReturnNotice['inbox_status'];
  },
): Promise<MerchantReturnNotice> {
  const db = await readDb();
  const existing = db.notices.find((n) => n.return_id === input.return_id);
  const now = new Date().toISOString();
  if (existing) {
    Object.assign(existing, input, { updated_at: now });
    await writeDb(db);
    return existing;
  }
  const notice: MerchantReturnNotice = {
    id: input.id || `mrn-${input.return_id}`,
    return_id: input.return_id,
    order_id: input.order_id,
    merchant_id: input.merchant_id,
    buyer_id: input.buyer_id,
    reason_code: input.reason_code,
    return_method: input.return_method,
    detail: input.detail,
    state: input.state,
    inbox_status: input.inbox_status || 'unread',
    created_at: now,
    updated_at: now,
  };
  db.notices.unshift(notice);
  await writeDb(db);
  return notice;
}

export async function listMerchantReturnNotices(merchantId: string): Promise<MerchantReturnNotice[]> {
  const db = await readDb();
  return db.notices
    .filter((n) => n.merchant_id === merchantId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function countUnreadMerchantReturns(merchantId: string): Promise<number> {
  const notices = await listMerchantReturnNotices(merchantId);
  return notices.filter((n) => n.inbox_status === 'unread' && n.state === 'requested').length;
}

export async function markMerchantReturnResponded(
  returnId: string,
  response: 'approved' | 'rejected',
  note?: string,
): Promise<MerchantReturnNotice | null> {
  const db = await readDb();
  const hit = db.notices.find((n) => n.return_id === returnId);
  if (!hit) return null;
  hit.inbox_status = 'responded';
  hit.merchant_response = response;
  hit.merchant_note = note;
  hit.updated_at = new Date().toISOString();
  await writeDb(db);
  return hit;
}
