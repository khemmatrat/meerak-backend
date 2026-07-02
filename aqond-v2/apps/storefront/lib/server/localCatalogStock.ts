import fs from 'fs/promises';
import path from 'path';

const DEV_CATALOG = path.join(process.cwd(), '.data', 'dev', 'catalog.json');

type DevCatalog = { products?: Array<Record<string, unknown>> };

async function readCatalog(): Promise<DevCatalog> {
  try {
    return JSON.parse(await fs.readFile(DEV_CATALOG, 'utf8'));
  } catch {
    return { products: [] };
  }
}

async function writeCatalog(data: DevCatalog) {
  await fs.mkdir(path.dirname(DEV_CATALOG), { recursive: true });
  await fs.writeFile(DEV_CATALOG, JSON.stringify(data, null, 2), 'utf8');
}

export async function readDevProductStock(productId: string): Promise<number | null> {
  const data = await readCatalog();
  const p = (data.products || []).find((x) => String(x.id) === productId);
  if (!p) return null;
  const stock = p.stock ?? p.inventory;
  return typeof stock === 'number' ? stock : null;
}

export async function decrementDevProductStock(
  productId: string,
  qty: number,
): Promise<{ ok: boolean; stock?: number }> {
  const data = await readCatalog();
  const p = (data.products || []).find((x) => String(x.id) === productId);
  if (!p) return { ok: false };
  const before = Number(p.stock ?? p.inventory ?? 0);
  const next = Math.max(0, before - qty);
  p.stock = next;
  p.inventory = next;
  await writeCatalog(data);
  return { ok: true, stock: next };
}
