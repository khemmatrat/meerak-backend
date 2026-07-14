import fs from 'fs/promises';
import path from 'path';

const INTENTS_FILE = path.join(process.cwd(), '.data', 'payment-intents.json');

export type LocalPaymentIntentStatus = 'pending' | 'captured' | 'failed';

export type LocalPaymentIntent = {
  intent_id: string;
  payso_reference_id: string;
  order_ids: string[];
  buyer_id: string;
  amount_micro: number;
  status: LocalPaymentIntentStatus;
  captured_at?: string;
  capture_source?: 'e2e-simulate' | 'webhook';
  created_at: string;
};

type IntentDb = { intents: LocalPaymentIntent[] };

async function readDb(): Promise<IntentDb> {
  try {
    const data = JSON.parse(await fs.readFile(INTENTS_FILE, 'utf8'));
    return { intents: data.intents || [] };
  } catch {
    return { intents: [] };
  }
}

async function writeDb(db: IntentDb) {
  await fs.mkdir(path.dirname(INTENTS_FILE), { recursive: true });
  await fs.writeFile(INTENTS_FILE, JSON.stringify(db, null, 2));
}

export async function registerLocalPaymentIntent(input: Omit<LocalPaymentIntent, 'created_at' | 'status'> & {
  status?: LocalPaymentIntentStatus;
}) {
  const db = await readDb();
  const existing = db.intents.find(
    (i) => i.intent_id === input.intent_id || i.payso_reference_id === input.payso_reference_id,
  );
  if (existing) return existing;

  const intent: LocalPaymentIntent = {
    ...input,
    status: input.status || 'pending',
    created_at: new Date().toISOString(),
  };
  db.intents.unshift(intent);
  await writeDb(db);
  return intent;
}

export async function findLocalPaymentIntent(opts: {
  intentId?: string;
  paysoReferenceId?: string;
}): Promise<LocalPaymentIntent | null> {
  const db = await readDb();
  const intentId = opts.intentId?.trim();
  const ref = opts.paysoReferenceId?.trim();
  return (
    db.intents.find(
      (i) =>
        (intentId && i.intent_id === intentId) ||
        (ref && i.payso_reference_id === ref),
    ) || null
  );
}

export async function markLocalPaymentIntentCaptured(
  paysoReferenceId: string,
  source: LocalPaymentIntent['capture_source'] = 'e2e-simulate',
): Promise<LocalPaymentIntent | null> {
  const db = await readDb();
  const ref = paysoReferenceId.trim();
  const hit = db.intents.find((i) => i.payso_reference_id === ref);
  if (!hit) return null;
  if (hit.status === 'captured') return hit;
  hit.status = 'captured';
  hit.captured_at = new Date().toISOString();
  hit.capture_source = source;
  await writeDb(db);
  return hit;
}

export function isLocalDevIntentId(intentId: string | undefined): boolean {
  return Boolean(intentId?.startsWith('lint-'));
}
