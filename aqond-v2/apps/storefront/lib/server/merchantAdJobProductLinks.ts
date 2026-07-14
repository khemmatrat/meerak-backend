import fs from 'fs/promises';
import path from 'path';

const FILE = path.join(process.cwd(), '.data', 'dev', 'merchant-ad-product-links.json');

type Store = { links: Record<string, { product_id: string; product_title?: string }> };

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8')) as Store;
  } catch {
    return { links: {} };
  }
}

async function writeStore(store: Store) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(store, null, 2));
}

export async function getJobProductLink(jobId: string) {
  const store = await readStore();
  return store.links[jobId] || null;
}

export async function setJobProductLink(
  jobId: string,
  link: { product_id: string; product_title?: string },
) {
  const store = await readStore();
  store.links[jobId] = link;
  await writeStore(store);
  return link;
}
