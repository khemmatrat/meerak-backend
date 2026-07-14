import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), '.data', 'studio');
const AFFILIATE_FILE = path.join(DATA_DIR, 'affiliate.json');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const MEDIA_INDEX = path.join(DATA_DIR, 'media-index.json');

export type StoredAffiliateLink = {
  id: string;
  creator_id: string;
  product_id: string;
  merchant_id: string;
  title: string;
  price_micro?: number;
  category?: string;
  commission_bps: number;
  synced_recsys: boolean;
  created_at: string;
};

export type StoredPost = {
  post_id: string;
  author_id: string;
  media_id?: string;
  caption: string;
  product_id?: string;
  media_local: boolean;
  synced_feed: boolean;
  created_at: string;
};

export type StoredMedia = {
  media_id: string;
  author_id: string;
  filename: string;
  content_type: string;
  status: 'ready' | 'processing';
  synced_video: boolean;
  created_at: string;
};

function newId(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
}

async function ensureDir() {
  await fs.mkdir(MEDIA_DIR, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown) {
  await ensureDir();
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

export async function listAffiliateLinks(creatorId: string): Promise<StoredAffiliateLink[]> {
  const data = await readJson<{ links: StoredAffiliateLink[] }>(AFFILIATE_FILE, { links: [] });
  return data.links.filter((l) => l.creator_id === creatorId);
}

export async function upsertAffiliateLink(input: {
  creator_id: string;
  product_id: string;
  merchant_id: string;
  title: string;
  price_micro?: number;
  category?: string;
  commission_bps?: number;
  synced_recsys?: boolean;
  link_id?: string;
}): Promise<StoredAffiliateLink> {
  const data = await readJson<{ links: StoredAffiliateLink[] }>(AFFILIATE_FILE, { links: [] });
  const existing = data.links.find(
    (l) => l.creator_id === input.creator_id && l.product_id === input.product_id,
  );
  if (existing) return existing;

  const link: StoredAffiliateLink = {
    id: input.link_id || newId('aff-'),
    creator_id: input.creator_id,
    product_id: input.product_id,
    merchant_id: input.merchant_id,
    title: input.title,
    price_micro: input.price_micro,
    category: input.category,
    commission_bps: input.commission_bps ?? 500,
    synced_recsys: !!input.synced_recsys,
    created_at: new Date().toISOString(),
  };
  data.links.unshift(link);
  await writeJson(AFFILIATE_FILE, data);
  return link;
}

export async function removeAffiliateLink(creatorId: string, productId: string) {
  const data = await readJson<{ links: StoredAffiliateLink[] }>(AFFILIATE_FILE, { links: [] });
  data.links = data.links.filter((l) => !(l.creator_id === creatorId && l.product_id === productId));
  await writeJson(AFFILIATE_FILE, data);
}

export async function listPosts(limit = 50): Promise<StoredPost[]> {
  const data = await readJson<{ posts: StoredPost[] }>(POSTS_FILE, { posts: [] });
  return data.posts.slice(0, limit);
}

export async function addPost(input: Omit<StoredPost, 'created_at'> & { created_at?: string }) {
  const data = await readJson<{ posts: StoredPost[] }>(POSTS_FILE, { posts: [] });
  const post: StoredPost = {
    ...input,
    created_at: input.created_at || new Date().toISOString(),
  };
  data.posts.unshift(post);
  await writeJson(POSTS_FILE, data);
  return post;
}

export async function saveMediaFile(
  authorId: string,
  buffer: Buffer,
  contentType: string,
  mediaId?: string,
): Promise<StoredMedia> {
  await ensureDir();
  const id = mediaId || newId('med-');
  const ext = contentType.includes('webm') ? 'webm' : contentType.includes('quicktime') ? 'mov' : 'mp4';
  const filename = `${id}.${ext}`;
  await fs.writeFile(path.join(MEDIA_DIR, filename), buffer);

  const index = await readJson<{ media: StoredMedia[] }>(MEDIA_INDEX, { media: [] });
  const entry: StoredMedia = {
    media_id: id,
    author_id: authorId,
    filename,
    content_type: contentType || 'video/mp4',
    status: 'ready',
    synced_video: false,
    created_at: new Date().toISOString(),
  };
  index.media = index.media.filter((m) => m.media_id !== id);
  index.media.unshift(entry);
  await writeJson(MEDIA_INDEX, index);
  return entry;
}

export async function getMedia(mediaId: string): Promise<{ meta: StoredMedia; filePath: string } | null> {
  const index = await readJson<{ media: StoredMedia[] }>(MEDIA_INDEX, { media: [] });
  const meta = index.media.find((m) => m.media_id === mediaId);
  if (!meta) return null;
  const filePath = path.join(MEDIA_DIR, meta.filename);
  try {
    await fs.access(filePath);
    return { meta, filePath };
  } catch {
    return null;
  }
}

export async function markMediaSynced(mediaId: string) {
  const index = await readJson<{ media: StoredMedia[] }>(MEDIA_INDEX, { media: [] });
  const hit = index.media.find((m) => m.media_id === mediaId);
  if (hit) hit.synced_video = true;
  await writeJson(MEDIA_INDEX, index);
}

export function localMediaPlaybackUrl(mediaId: string) {
  return `/api/studio/media/${mediaId}`;
}
