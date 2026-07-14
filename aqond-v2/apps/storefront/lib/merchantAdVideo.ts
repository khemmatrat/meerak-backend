export type AdShot = {

  shot: number;

  role: string;

  image_prompt: string;

  video_prompt: string;

  duration_sec: number;

};



export type AdVideoBrief = {

  title: string;

  tagline_th: string;

  shots: AdShot[];

  source?: string;

};



export type AdTokenPackage = {

  id: string;

  price_thb: number;

  tokens: number;

  badge: string;

};



export const AD_TOKEN_PACKAGES: AdTokenPackage[] = [

  { id: 'p99', price_thb: 99, tokens: 100, badge: 'เริ่มต้น' },

  { id: 'p199', price_thb: 199, tokens: 220, badge: 'คุ้ม +10%' },

  { id: 'p399', price_thb: 399, tokens: 500, badge: 'ยอดนิยม +25%' },

  { id: 'p599', price_thb: 599, tokens: 800, badge: '+33%' },

  { id: 'p799', price_thb: 799, tokens: 1100, badge: '+38%' },

  { id: 'p999', price_thb: 999, tokens: 1500, badge: '+51%' },

  { id: 'p1299', price_thb: 1299, tokens: 2000, badge: 'สุดคุ้ม +54%' },

];



export const TOKENS_PER_VIDEO = 100;

export const MIN_TOPUP_THB = 99;



export type AdTokenQuota = {

  week_key: string;

  limit: number;

  used: number;

  remaining: number;

  tokens: number;

  tokens_per_video: number;

  token_videos_available: number;

  can_generate: boolean;

  next_charge: 'free_weekly' | 'tokens' | 'none';

};



export type DirectorValidationCheck = {
  id: string;
  label: string;
  passed: boolean;
  message?: string;
};

export type DirectorValidation = {
  ok: boolean;
  checks: DirectorValidationCheck[];
  errors?: Array<{ id: string; message: string }>;
};

export type DirectorMerchantPreview = {
  script: {
    full_text: string | null;
    type: string | null;
    marketing_strategy?: string | null;
    word_count: number;
  };
  prompt_summary: {
    preview?: string;
    spoken_text?: string | null;
    skipped?: boolean;
    reason?: string;
  };
  duration: {
    clip_sec: number;
    estimated_wait_label: string;
    estimated_wait_sec?: number;
  };
  style: { id: string; label_th: string };
  cost: {
    tokens?: number;
    charge_source?: string;
    estimated_duration_label?: string;
    estimated_duration_sec?: number;
    aspect_ratio?: string;
    resolution?: string;
    video_generation?: { label?: string; tokens_approx?: number; note?: string };
  };
  validation: DirectorValidation;
  format: string;
  video_provider_id?: string;
  aspect_ratio?: string;
  resolution?: string;
  ready_to_generate: boolean;
};

export type DirectorPlanResponse = {
  plan: Record<string, unknown>;
  preview: DirectorMerchantPreview;
  validation: DirectorValidation;
  cost_estimate: DirectorMerchantPreview['cost'];
};

export type DirectorRunResponse = DirectorPlanResponse & {
  job: AdVideoJob;
  quota: AdTokenQuota;
  async?: boolean;
};

/** Map storefront style chips → AI Director style_id */
export const STYLE_PRESET_TO_DIRECTOR: Record<string, string | undefined> = {
  premium: 'luxury_brand',
  energetic: 'tiktok_creator',
  discount: 'tiktok_creator',
  natural: 'friendly_seller',
  new: 'tiktok_creator',
};

export const GENERATION_STATE_LABEL_TH: Record<string, string> = {
  queued: 'รอคิว',
  planning: 'วางแผนคลิป',
  validating: 'ตรวจสอบข้อมูล',
  generating: 'กำลังสร้างวิดีโอ',
  uploading: 'ประมวลผลคลิป',
  publishing: 'เตรียมเผยแพร่',
  completed: 'เสร็จแล้ว',
  failed: 'ล้มเหลว',
};

export function generationStateLabel(state?: string): string | undefined {
  if (!state) return undefined;
  return GENERATION_STATE_LABEL_TH[state] || state;
}

export function buildDirectorPayload(opts: {
  merchantId: string;
  merchantName: string;
  ownerId: string;
  productId?: string;
  productTitle: string;
  imageUrl: string;
  stylePresetId: string;
  categoryStyle: string;
  visualNotes: string;
}) {
  const preset = AD_STYLE_PRESETS.find((s) => s.id === opts.stylePresetId) || AD_STYLE_PRESETS[0];
  let directorStyleId = STYLE_PRESET_TO_DIRECTOR[opts.stylePresetId];
  if (opts.categoryStyle === 'food') {
    directorStyleId =
      opts.stylePresetId === 'premium'
        ? 'restaurant_owner'
        : opts.stylePresetId === 'natural'
          ? 'friendly_seller'
          : 'tiktok_creator';
  }
  const guide: AdGuide = {
    category_style: opts.categoryStyle,
    mood: preset.mood,
    audience: 'all',
    hook: preset.hook,
    visual_notes: opts.visualNotes,
  };
  return {
    merchant_id: opts.merchantId,
    merchant_name: opts.merchantName,
    owner_id: opts.ownerId,
    product_id: opts.productId || undefined,
    product_title: opts.productTitle,
    product_image_url: opts.imageUrl,
    portrait_image_url: opts.imageUrl,
    category_id: opts.categoryStyle,
    style_id: directorStyleId,
    guide,
  };
}

export async function fetchDirectorPlan(payload: Record<string, unknown>): Promise<DirectorPlanResponse> {
  const res = await fetch('/api/merchant/ad-video/director/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.hint || data.error || 'plan_failed');
  }
  return data as DirectorPlanResponse;
}

export async function runDirectorAd(payload: Record<string, unknown>): Promise<DirectorRunResponse> {
  const res = await fetch('/api/merchant/ad-video/director/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok && res.status !== 202) {
    throw new Error(data.hint || data.error || 'director_run_failed');
  }
  return data as DirectorRunResponse;
}

export type AdVideoJob = {

  id: string;

  merchant_id: string;

  product_title: string;

  status: string;

  progress_pct: number;

  estimated_sec?: number;

  brief?: AdVideoBrief;

  output_video_url?: string;

  output_poster_url?: string;

  video_engine?: string;

  current_shot?: number;

  shot_engines?: string[];

  generation_state?: string;

  generation_timeline?: Array<{ state: string; at: string }>;

  director_plan?: Record<string, unknown>;

  published_at?: string;

  publish?: {

    target?: string;

    post_id?: string;

    media_id?: string;

    playback_url?: string;

    synced_feed?: boolean;

    mode?: string;

    published_at?: string;

  };

  error?: string;

  product_id?: string;

  product_image_url?: string;

  created_at: string;

};



export type AdGuide = {

  category_style: string;

  mood: string;

  audience: string;

  hook: string;

  visual_notes: string;

};



/** สไตล์ที่แม่ค้าเลือกได้ง่าย — ไม่ต้องรู้ศัพท์เทคนิค */

export const AD_STYLE_PRESETS = [

  { id: 'premium', emoji: '✨', label: 'หรู พรีเมียม', mood: 'premium', hook: 'quality' },

  { id: 'energetic', emoji: '🔥', label: 'สดใส ขายดี', mood: 'energetic', hook: 'bestseller' },

  { id: 'discount', emoji: '💰', label: 'โปรโมชัน ลดราคา', mood: 'energetic', hook: 'discount' },

  { id: 'natural', emoji: '🌿', label: 'ธรรมชาติ ออร์แกนิก', mood: 'natural', hook: 'quality' },

  { id: 'new', emoji: '🆕', label: 'สินค้าใหม่', mood: 'minimal', hook: 'new' },

] as const;



export const AD_CATEGORY_OPTIONS = [

  { id: 'general', label: 'ทั่วไป', emoji: '🛍️' },

  { id: 'skincare', label: 'ความงาม', emoji: '💄' },

  { id: 'food', label: 'อาหาร', emoji: '🍜' },

  { id: 'fashion', label: 'แฟชั่น', emoji: '👗' },

  { id: 'electronics', label: 'อิเล็กฯ', emoji: '📱' },

];



export async function fetchAdQuota(merchantId: string): Promise<AdTokenQuota> {

  const res = await fetch(`/api/merchant/ad-video/quota?merchant_id=${encodeURIComponent(merchantId)}`, {

    cache: 'no-store',

  });

  if (!res.ok) throw new Error('quota_failed');

  return res.json();

}



export async function fetchAdJobs(merchantId: string) {

  const res = await fetch(`/api/merchant/ad-video/jobs?merchant_id=${encodeURIComponent(merchantId)}`, {

    cache: 'no-store',

  });

  if (!res.ok) throw new Error('jobs_failed');

  return res.json() as Promise<{ jobs: AdVideoJob[]; quota: AdTokenQuota }>;

}



export async function createAdBrief(payload: Record<string, string>) {

  const res = await fetch('/api/merchant/ad-video/brief', {

    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify(payload),

  });

  const data = await res.json();

  if (!res.ok) throw new Error(data.error || 'brief_failed');

  return data.brief as AdVideoBrief;

}



export async function generateAdVideo(payload: Record<string, unknown>) {
  const res = await fetch('/api/merchant/ad-video/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok && res.status !== 202) {
    throw new Error(data.hint || data.error || 'generate_failed');
  }
  return data as { job: AdVideoJob; quota: AdTokenQuota; async?: boolean };
}

export async function fetchAdJob(jobId: string): Promise<AdVideoJob> {
  const res = await fetch(`/api/merchant/ad-video/jobs/${encodeURIComponent(jobId)}`, {
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'job_not_found');
  return data.job as AdVideoJob;
}

const DEFAULT_BUDGET_SEC = 120;
const MAX_ETA_SEC = 20 * 60;

/** ETA ที่ไม่พุ่งเป็นร้อยนาทีเมื่อ progress ค้างที่ 2% */
export function estimateEtaSec(job: AdVideoJob, elapsedSec: number): number {
  if ((job.progress_pct || 0) >= 99) return 0;

  const budget = job.estimated_sec || DEFAULT_BUDGET_SEC;
  const budgetRemain = Math.max(0, budget - elapsedSec);
  const pct = job.progress_pct || 0;

  if (pct < 8) {
    return Math.min(budgetRemain || budget, MAX_ETA_SEC);
  }

  const safePct = Math.max(8, pct);
  const projectedTotal = (elapsedSec / safePct) * 100;
  const linearRemain = Math.max(0, projectedTotal - elapsedSec);
  return Math.min(Math.round(linearRemain), budgetRemain + 60, MAX_ETA_SEC);
}

/** แสดง progress — ใช้ค่าจาก server เป็นหลัก */
export function displayProgressPct(job: AdVideoJob, elapsedSec: number): number {
  const server = job.progress_pct || 0;
  const budget = job.estimated_sec || DEFAULT_BUDGET_SEC;

  if (server >= 99) return server;
  if (server >= 15) return server;

  if (server < 15) {
    const simulated = 5 + Math.min(40, (elapsedSec / Math.max(budget, 45)) * 40);
    return Math.max(server, Math.round(simulated));
  }

  if (job.status === 'generating' && elapsedSec > budget * 1.2) {
    return Math.min(94, server + Math.floor((elapsedSec - budget) / 20));
  }

  return server;
}

export function isStaleGeneratingJob(job: AdVideoJob, elapsedSec: number): boolean {
  if (job.status !== 'generating') return false;
  const budget = job.estimated_sec || DEFAULT_BUDGET_SEC;
  return elapsedSec > budget * 1.5 && (job.progress_pct || 0) >= 75;
}



export async function publishAdVideo(
  jobId: string,
  merchantId: string,
  target = 'studio_feed',
  product?: Record<string, unknown>,
) {

  const res = await fetch('/api/merchant/ad-video/publish', {

    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify({ job_id: jobId, merchant_id: merchantId, target, product }),

  });

  const data = await res.json();

  if (!res.ok) throw new Error(data.error || 'publish_failed');

  return data;

}



export async function topUpAdTokens(

  merchantId: string,

  opts: { packageId?: string; customThb?: number },

) {

  const res = await fetch('/api/merchant/ad-video/topup', {

    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify({

      merchant_id: merchantId,

      package_id: opts.packageId,

      custom_thb: opts.customThb,

    }),

  });

  const data = await res.json();

  if (!res.ok) throw new Error(data.error || 'topup_failed');

  return data;

}



export async function uploadAdProductImage(merchantId: string, file: File) {

  const fd = new FormData();

  fd.append('merchant_id', merchantId);

  fd.append('file', file);

  const res = await fetch('/api/merchant/ad-video/upload-image', { method: 'POST', body: fd });

  const data = await res.json();

  if (!res.ok) throw new Error(data.error || 'upload_failed');

  return data.image_url as string;

}



export function videosFromTokens(tokens: number) {

  return Math.floor(tokens / TOKENS_PER_VIDEO);

}



export function tokensForCustomAmount(thb: number) {

  if (thb < MIN_TOPUP_THB) return 0;

  return Math.floor((thb / 99) * 100);

}



export type AdProductDraft = {

  title: string;

  benefits: string;

  description: string;

  size_guide?: string;

  price_thb: number;

  stock: number;

  category: string;

  food_style?: string;

  tags: string[];

  source: 'vision' | 'rules';

};



export async function fetchAdProductDraft(payload: Record<string, unknown>): Promise<AdProductDraft> {

  const res = await fetch('/api/merchant/ad-video/product-draft', {

    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify(payload),

  });

  const data = await res.json();

  if (!res.ok) throw new Error(data.error || 'draft_failed');

  return data.draft as AdProductDraft;

}



export async function saveMerchantProduct(payload: Record<string, unknown>) {

  const res = await fetch('/api/merchant/products', {

    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify(payload),

  });

  const data = await res.json();

  if (!res.ok) throw new Error(data.error || 'save_product_failed');

  return data.product as { id: string; title: string };

}



export async function linkAdJobProduct(

  jobId: string,

  payload: { product_id: string; product_title?: string },

) {

  const res = await fetch(`/api/merchant/ad-video/jobs/${encodeURIComponent(jobId)}`, {

    method: 'PATCH',

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify(payload),

  });

  const data = await res.json();

  if (!res.ok) throw new Error(data.error || 'link_failed');

  return data.job;

}

const PUBLISH_ERROR_TH: Record<string, string> = {
  job_not_found: 'ไม่พบงานวิดีโอ — สร้างคลิปใหม่',
  job_not_ready: 'คลิปยังไม่พร้อม — รอให้สร้างเสร็จก่อน',
  video_missing: 'ไม่พบไฟล์วิดีโอ — ลองสร้างคลิปใหม่',
  video_file_missing: 'โหลดไฟล์วิดีโอไม่ได้ — ตรวจ backend หรือลองใหม่',
  publish_failed: 'เผยแพร่ไม่สำเร็จ — ลองอีกครั้ง',
  quota_failed: 'โควต้าไม่พอ',
  generate_failed: 'สร้างวิดีโอไม่สำเร็จ',
  validation_failed: 'ข้อมูลไม่ครบหรือไม่ผ่านการตรวจสอบ — ดูรายการด้านบน',
  aivos_unavailable: 'ระบบ AI ไม่พร้อม — restart backend แล้วลองใหม่',
  director_run_failed: 'เริ่มสร้างคลิปไม่สำเร็จ',
  plan_failed: 'โหลดตัวอย่างไม่สำเร็จ',
};

export function mapAdStudioError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'unknown_error');
  const code = raw.split(':')[0]?.trim() || raw;
  if (PUBLISH_ERROR_TH[code]) return PUBLISH_ERROR_TH[code];
  if (raw.includes('Failed to fetch') || raw.includes('NetworkError')) {
    return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจเน็ตหรือลองใหม่';
  }
  return raw.length > 120 ? 'เกิดข้อผิดพลาด — ลองอีกครั้ง' : raw;
}

