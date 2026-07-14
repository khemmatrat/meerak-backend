import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const AUDIT_FILE = path.join(process.cwd(), '.data', 'dev', 'merchant-audit.json');

export type MerchantAuditEvent = {
  id: string;
  merchant_id: string;
  at: string;
  actor: string;
  actor_label?: string;
  action: string;
  summary: string;
  meta?: Record<string, unknown>;
};

type Store = Record<string, MerchantAuditEvent[]>;

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(AUDIT_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function writeStore(store: Store) {
  await fs.mkdir(path.dirname(AUDIT_FILE), { recursive: true });
  await fs.writeFile(AUDIT_FILE, JSON.stringify(store, null, 2), 'utf8');
}

export async function appendMerchantAudit(input: {
  merchant_id: string;
  actor: string;
  actor_label?: string;
  action: string;
  summary: string;
  meta?: Record<string, unknown>;
}): Promise<MerchantAuditEvent> {
  const store = await readStore();
  const event: MerchantAuditEvent = {
    id: `aud-${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
    merchant_id: input.merchant_id,
    at: new Date().toISOString(),
    actor: input.actor,
    actor_label: input.actor_label,
    action: input.action,
    summary: input.summary,
    meta: input.meta,
  };
  const list = store[input.merchant_id] || [];
  list.unshift(event);
  store[input.merchant_id] = list.slice(0, 500);
  await writeStore(store);
  return event;
}

export async function listMerchantAudit(merchantId: string, limit = 80): Promise<MerchantAuditEvent[]> {
  const store = await readStore();
  return (store[merchantId] || []).slice(0, limit);
}
