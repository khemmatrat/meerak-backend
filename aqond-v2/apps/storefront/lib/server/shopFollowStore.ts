import fs from 'fs/promises';
import path from 'path';

const FILE = path.join(process.cwd(), '.data', 'dev', 'shop-follows.json');

type FollowRow = { user_id: string; shop_id: string; created_at: string };

async function readAll(): Promise<FollowRow[]> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE, 'utf8')) as { follows?: FollowRow[] };
    return raw.follows || [];
  } catch {
    return [];
  }
}

async function writeAll(follows: FollowRow[]) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify({ follows }, null, 2), 'utf8');
}

export async function isFollowingShop(userId: string, shopId: string): Promise<boolean> {
  if (!userId || userId === 'guest') return false;
  const rows = await readAll();
  return rows.some((r) => r.user_id === userId && r.shop_id === shopId);
}

export async function toggleShopFollow(
  userId: string,
  shopId: string,
): Promise<{ following: boolean; follower_count: number }> {
  const rows = await readAll();
  const idx = rows.findIndex((r) => r.user_id === userId && r.shop_id === shopId);
  if (idx >= 0) {
    rows.splice(idx, 1);
  } else {
    rows.push({ user_id: userId, shop_id: shopId, created_at: new Date().toISOString() });
  }
  await writeAll(rows);
  const following = idx < 0;
  const follower_count = baseFollowers(shopId) + rows.filter((r) => r.shop_id === shopId).length;
  return { following, follower_count };
}

export function baseFollowers(shopId: string): number {
  let n = 0;
  for (const c of shopId) n += c.charCodeAt(0);
  return 800 + (n % 3200);
}

export async function followerCount(shopId: string): Promise<number> {
  const rows = await readAll();
  return baseFollowers(shopId) + rows.filter((r) => r.shop_id === shopId).length;
}
