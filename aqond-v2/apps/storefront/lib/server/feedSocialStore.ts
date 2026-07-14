import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const FILE = path.join(process.cwd(), '.data', 'dev', 'feed-social.json');

export type StoredFeedComment = {
  id: string;
  user_id: string;
  user_name: string;
  text: string;
  at: string;
};

type PostSocial = {
  likes: string[];
  saves: string[];
  comments: StoredFeedComment[];
  share_count: number;
};

type Store = { posts: Record<string, PostSocial> };

async function readStore(): Promise<Store> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE, 'utf8')) as Store;
    return { posts: raw.posts || {} };
  } catch {
    return { posts: {} };
  }
}

async function writeStore(data: Store) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), 'utf8');
}

function seedLikes(postId: string): number {
  let n = 0;
  for (const c of postId) n += c.charCodeAt(0);
  return 80 + (n % 920);
}

function postRow(store: Store, postId: string): PostSocial {
  if (!store.posts[postId]) {
    store.posts[postId] = { likes: [], saves: [], comments: [], share_count: 0 };
  }
  return store.posts[postId];
}

export async function getFeedSocialState(postId: string, userId: string) {
  const store = await readStore();
  const row = postRow(store, postId);
  const baseLikes = seedLikes(postId);
  return {
    liked: row.likes.includes(userId),
    saved: row.saves.includes(userId),
    like_count: baseLikes + row.likes.length,
    comment_count: row.comments.length,
    share_count: row.share_count,
    comments: row.comments.slice(0, 50),
  };
}

export async function toggleFeedLike(postId: string, userId: string) {
  const store = await readStore();
  const row = postRow(store, postId);
  const idx = row.likes.indexOf(userId);
  if (idx >= 0) row.likes.splice(idx, 1);
  else row.likes.push(userId);
  await writeStore(store);
  const baseLikes = seedLikes(postId);
  return {
    liked: idx < 0,
    like_count: baseLikes + row.likes.length,
  };
}

export async function toggleFeedSave(postId: string, userId: string) {
  const store = await readStore();
  const row = postRow(store, postId);
  const idx = row.saves.indexOf(userId);
  if (idx >= 0) row.saves.splice(idx, 1);
  else row.saves.push(userId);
  await writeStore(store);
  return { saved: idx < 0 };
}

export async function addFeedComment(
  postId: string,
  userId: string,
  userName: string,
  text: string,
) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('comment_empty');
  const store = await readStore();
  const row = postRow(store, postId);
  const comment: StoredFeedComment = {
    id: `c-${crypto.randomBytes(6).toString('hex')}`,
    user_id: userId,
    user_name: userName || 'ผู้ใช้',
    text: trimmed.slice(0, 500),
    at: new Date().toISOString(),
  };
  row.comments.unshift(comment);
  row.comments = row.comments.slice(0, 100);
  await writeStore(store);
  return { comment, comment_count: row.comments.length };
}

export async function recordFeedShare(postId: string) {
  const store = await readStore();
  const row = postRow(store, postId);
  row.share_count += 1;
  await writeStore(store);
  return { share_count: row.share_count };
}

export async function listSavedPostIds(userId: string): Promise<string[]> {
  const store = await readStore();
  return Object.entries(store.posts)
    .filter(([, row]) => row.saves.includes(userId))
    .map(([id]) => id);
}
