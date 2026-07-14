/** Dev-lite product/query vectors for recsys-svc cosine retrieval (P100). */

export const EMBED_DIM = 64;

const CATEGORIES = ['fashion', 'beauty', 'electronics', 'food', 'home', 'sports', 'general'];

function hashToken(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,./|]+/)
    .filter((t) => t.length > 1)
    .slice(0, 48);
}

function addTokens(vec: number[], tokens: string[], weight = 1) {
  for (const t of tokens) {
    const h = hashToken(t);
    vec[h % EMBED_DIM] += weight;
    vec[(h >>> 8) % EMBED_DIM] += weight * 0.5;
  }
}

function addCategory(vec: number[], category?: string) {
  const idx = CATEGORIES.indexOf(category || 'general');
  if (idx >= 0) vec[idx] += 2.5;
}

/** Lightweight visual fingerprint from base64 pixels (color/layout buckets). */
function addImageBuckets(vec: number[], imageBase64?: string) {
  if (!imageBase64) return;
  const raw = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const step = Math.max(1, Math.floor(raw.length / 32));
  for (let i = 0; i < raw.length && i < step * 32; i += step) {
    vec[(raw.charCodeAt(i) + i) % EMBED_DIM] += 0.15;
  }
}

function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export function buildProductEmbedding(input: {
  vision?: string;
  title?: string;
  description?: string;
  category?: string;
  imageBase64?: string;
}): number[] {
  const vec = new Array(EMBED_DIM).fill(0);
  addTokens(vec, tokenize([input.vision, input.title, input.description].filter(Boolean).join(' ')));
  addCategory(vec, input.category);
  addImageBuckets(vec, input.imageBase64);
  return normalize(vec);
}
