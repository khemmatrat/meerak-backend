import fs from 'fs/promises';
import path from 'path';

const PUSH_FILE = path.join(process.cwd(), '.data', 'dev', 'merchant-push-subscriptions.json');

type Sub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  owner_id: string;
  merchant_ids: string[];
  created_at: string;
};

type Store = { subscriptions: Sub[] };

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(PUSH_FILE, 'utf8'));
  } catch {
    return { subscriptions: [] };
  }
}

async function writeStore(store: Store) {
  await fs.mkdir(path.dirname(PUSH_FILE), { recursive: true });
  await fs.writeFile(PUSH_FILE, JSON.stringify(store, null, 2), 'utf8');
}

export async function saveSubscription(body: {
  subscription?: { endpoint?: string; keys?: { p256dh: string; auth: string } };
  owner_id?: string;
  merchant_id?: string;
}) {
  const { subscription, owner_id, merchant_id } = body;
  if (!subscription?.endpoint || !owner_id) return;
  const store = await readStore();
  store.subscriptions = store.subscriptions.filter((s) => s.endpoint !== subscription.endpoint);
  store.subscriptions.unshift({
    endpoint: subscription.endpoint,
    keys: subscription.keys || { p256dh: '', auth: '' },
    owner_id,
    merchant_ids: merchant_id ? [merchant_id] : ['*'],
    created_at: new Date().toISOString(),
  });
  store.subscriptions = store.subscriptions.slice(0, 200);
  await writeStore(store);
}

export async function count() {
  const store = await readStore();
  return store.subscriptions.length;
}
