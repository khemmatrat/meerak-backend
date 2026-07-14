import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const REVIEWS_FILE = path.join(process.cwd(), '.data', 'reviews.json');

export type StoredReview = {
  id: string;
  product_id: string;
  merchant_id: string;
  author_id: string;
  order_id: string;
  rating: number;
  title?: string;
  body?: string;
  likes?: number;
  views?: number;
  coins_earned?: number;
  created_at: string;
};

type ReviewDb = { reviews: StoredReview[] };

async function readDb(): Promise<ReviewDb> {
  try {
    const data = JSON.parse(await fs.readFile(REVIEWS_FILE, 'utf8'));
    return { reviews: data.reviews || [] };
  } catch {
    return { reviews: [] };
  }
}

async function writeDb(db: ReviewDb) {
  await fs.mkdir(path.dirname(REVIEWS_FILE), { recursive: true });
  await fs.writeFile(REVIEWS_FILE, JSON.stringify(db, null, 2));
}

export async function listReviewsForAuthor(authorId: string): Promise<StoredReview[]> {
  const db = await readDb();
  return db.reviews
    .filter((r) => r.author_id === authorId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function listReviewsForProduct(productId: string): Promise<StoredReview[]> {
  const db = await readDb();
  return db.reviews.filter((r) => r.product_id === productId);
}

export async function findReviewByOrderProduct(
  orderId: string,
  productId: string,
  authorId: string,
): Promise<StoredReview | null> {
  const db = await readDb();
  return (
    db.reviews.find(
      (r) => r.order_id === orderId && r.product_id === productId && r.author_id === authorId,
    ) || null
  );
}

export async function saveReview(
  input: Omit<StoredReview, 'id' | 'created_at' | 'likes' | 'views' | 'coins_earned'> & {
    id?: string;
    likes?: number;
    views?: number;
    coins_earned?: number;
  },
): Promise<StoredReview> {
  const db = await readDb();
  const dup = db.reviews.find(
    (r) =>
      r.order_id === input.order_id &&
      r.product_id === input.product_id &&
      r.author_id === input.author_id,
  );
  if (dup) throw new Error('review_duplicate');

  const review: StoredReview = {
    id: input.id || `rv-${crypto.randomBytes(6).toString('hex')}`,
    product_id: input.product_id,
    merchant_id: input.merchant_id,
    author_id: input.author_id,
    order_id: input.order_id,
    rating: input.rating,
    title: input.title,
    body: input.body,
    likes: input.likes ?? 0,
    views: input.views ?? 0,
    coins_earned: input.coins_earned ?? 0,
    created_at: new Date().toISOString(),
  };
  db.reviews.unshift(review);
  await writeDb(db);
  return review;
}
