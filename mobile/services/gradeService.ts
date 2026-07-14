/**
 * gradeService.ts
 * ──────────────────────────────────────────────────────
 * Worker Grading & VVIP System — Frontend Service Layer
 *
 * Grade Tiers:
 *   Grade A (Elite / VVIP)  : avg >= 4.5 + cert > 3 + success >= 95%
 *   Grade B (Professional)  : avg >= 3.5 + cert >= 1
 *   Grade C (Standard)      : ทุกคนที่ไม่ผ่านเงื่อนไขข้างต้น
 */

import { api } from './api';

// ── Types ──────────────────────────────────────────────────────────────

export type WorkerGrade = 'A' | 'B' | 'C';

export interface GradeData {
  grade:            WorkerGrade;
  avg_rating:       number;
  total_reviews:    number;
  total_jobs:       number;
  success_rate:     number;
  cert_count:       number;
  is_vvip_eligible: boolean;
  last_calculated?: string;
}

export interface ReviewCategory {
  rating_quality?:       number;
  rating_punctuality?:   number;
  rating_attitude?:      number;
  rating_cleanliness?:   number;
  rating_communication?: number;
}

export interface SubmitReviewPayload extends ReviewCategory {
  job_id:         string;
  reviewee_id:    string;
  rating_overall: number;
  tags?:          string[];
  comment?:       string;
}

export interface WorkerReview {
  id:                   string;
  job_id:               string;
  rating_overall:       number;
  rating_quality?:      number;
  rating_punctuality?:  number;
  rating_attitude?:     number;
  rating_cleanliness?:  number;
  rating_communication?:number;
  tags:                 string[];
  comment?:             string;
  created_at:           string;
  reviewer_name:        string;
  reviewer_avatar?:     string;
}

export interface ReviewStats {
  avg_overall:        number;
  avg_quality:        number;
  avg_punctuality:    number;
  avg_attitude:       number;
  avg_cleanliness:    number;
  avg_communication:  number;
  total_reviews:      number;
}

// ── Grade Metadata ─────────────────────────────────────────────────────

export const GRADE_META: Record<WorkerGrade, {
  label:       string;
  labelTh:     string;
  color:       string;
  bgColor:     string;
  borderColor: string;
  shimmer:     boolean;
  badge:       string;
  description: string;
}> = {
  A: {
    label:       'Grade A — Elite',
    labelTh:     'เกรด A • Elite',
    color:       '#D4AF37',
    bgColor:     'linear-gradient(135deg, #D4AF37 0%, #F5E27D 50%, #B8860B 100%)',
    borderColor: '#D4AF37',
    shimmer:     true,
    badge:       'VVIP Verified',
    description: 'คะแนนเฉลี่ย ≥ 4.5 • ใบเซอร์ > 3 ใบ • งานสำเร็จ ≥ 95%',
  },
  B: {
    label:       'Grade B — Professional',
    labelTh:     'เกรด B • Professional',
    color:       '#818CF8',
    bgColor:     'linear-gradient(135deg, #6366F1 0%, #818CF8 100%)',
    borderColor: '#6366F1',
    shimmer:     false,
    badge:       'Pro',
    description: 'คะแนนเฉลี่ย ≥ 3.5 • มีใบเซอร์อย่างน้อย 1 ใบ',
  },
  C: {
    label:       'Grade C — Standard',
    labelTh:     'เกรด C • Standard',
    color:       '#94A3B8',
    bgColor:     'linear-gradient(135deg, #475569 0%, #64748B 100%)',
    borderColor: '#475569',
    shimmer:     false,
    badge:       'Standard',
    description: 'คะแนนเฉลี่ย < 3.5 หรือยังไม่มีใบเซอร์',
  },
};

// Grade A requirements — ใช้ใน UI แสดงว่าต้องทำอะไรเพิ่ม
export const GRADE_REQUIREMENTS = {
  A: { avg_rating: 4.5, cert_count: 4, success_rate: 95 },
  B: { avg_rating: 3.5, cert_count: 1, success_rate: 0  },
  C: { avg_rating: 0,   cert_count: 0, success_rate: 0  },
} as const;

/**
 * คำนวณว่าต้องทำอะไรเพิ่มถึงจะขึ้น Grade (client-side estimate)
 */
export function getProgressToNextGrade(data: GradeData): {
  nextGrade:     WorkerGrade | null;
  missingItems:  string[];
  progressPct:   number;
} {
  if (data.grade === 'A') return { nextGrade: null, missingItems: [], progressPct: 100 };

  // Coerce to number defensively (PostgreSQL DECIMAL arrives as string sometimes)
  const avgRating   = parseFloat(String(data.avg_rating   ?? 0));
  const certCount   = parseInt  (String(data.cert_count   ?? 0));
  const successRate = parseFloat(String(data.success_rate ?? 0));
  const totalJobs   = parseInt  (String(data.total_jobs   ?? 0));

  const targetGrade: WorkerGrade = data.grade === 'C' ? 'B' : 'A';
  const req = GRADE_REQUIREMENTS[targetGrade];
  const missing: string[] = [];

  if (avgRating < req.avg_rating)
    missing.push(`คะแนนเฉลี่ยต้องถึง ${req.avg_rating} (ตอนนี้ ${avgRating.toFixed(1)})`);
  if (certCount < req.cert_count)
    missing.push(`ต้องมีใบเซอร์ ${req.cert_count} ใบ (ตอนนี้ ${certCount})`);
  if (req.success_rate > 0 && successRate < req.success_rate)
    missing.push(`งานสำเร็จต้องถึง ${req.success_rate}% (ตอนนี้ ${successRate.toFixed(0)}%)`);
  // Grade A also requires > 20 jobs
  if (targetGrade === 'A' && totalJobs <= 20)
    missing.push(`ต้องมีงานสำเร็จ > 20 งาน (ตอนนี้ ${totalJobs})`);

  // Progress % คำนวณแบบ weighted average
  const scores = [
    Math.min(req.avg_rating > 0 ? avgRating / req.avg_rating : 1, 1),
    req.cert_count > 0 ? Math.min(certCount / req.cert_count, 1) : 1,
    req.success_rate > 0 ? Math.min(successRate / req.success_rate, 1) : 1,
  ];
  const progressPct = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100);

  return { nextGrade: targetGrade, missingItems: missing, progressPct };
}

// ── Smart Tags per Category ────────────────────────────────────────────

export const SMART_TAGS_BY_CATEGORY: Record<string, string[]> = {
  Cleaning:     ['ทำงานเรียบร้อย', 'ตรงเวลา', 'ใส่ใจรายละเอียด', 'ระมัดระวังของ', 'สื่อสารดี'],
  Chef:         ['อาหารอร่อย', 'ถูกสุขอนามัย', 'ตรงเวลา', 'จัดสรรดี', 'ปรับรสได้'],
  Massage:      ['มืออาชีพ', 'ผ่อนคลาย', 'ตรงเวลา', 'สะอาด', 'ใส่ใจสุขภาพลูกค้า'],
  Tutor:        ['อธิบายชัดเจน', 'ตั้งใจสอน', 'ตรงเวลา', 'ปรับระดับได้', 'ให้กำลังใจ'],
  Security:     ['ตื่นตัวสูง', 'มืออาชีพ', 'รับผิดชอบ', 'ตรงเวลา', 'สื่อสารดี'],
  Driver:       ['ขับดี', 'ตรงเวลา', 'สุภาพ', 'รู้เส้นทาง', 'รถสะอาด'],
  Photographer: ['งานสวย', 'สร้างสรรค์', 'ตรงเวลา', 'แก้ไขรวดเร็ว', 'สื่อสารดี'],
  Design:       ['งานสวย', 'เข้าใจ brief', 'แก้ไขรวดเร็ว', 'ตรงเวลา', 'ความคิดสร้างสรรค์'],
  Trainer:      ['สอนดี', 'ให้กำลังใจ', 'ปลอดภัย', 'ตรงเวลา', 'รู้จริง'],
  Medical:      ['เชี่ยวชาญ', 'ใส่ใจ', 'ปลอดภัย', 'สื่อสารดี', 'เชื่อถือได้'],
  Event:        ['จัดงานดี', 'ตรงเวลา', 'แก้ไขปัญหาเก่ง', 'สร้างสรรค์', 'สื่อสารดี'],
  default:      ['มืออาชีพ', 'ตรงเวลา', 'ซื่อสัตย์', 'ทำงานดี', 'แนะนำให้คนอื่น'],
};

export function getSmartTags(category?: string): string[] {
  if (!category) return SMART_TAGS_BY_CATEGORY.default;
  return SMART_TAGS_BY_CATEGORY[category] ?? SMART_TAGS_BY_CATEGORY.default;
}

// ── API Calls ──────────────────────────────────────────────────────────

export const gradeService = {
  /** ดึง grade ของ worker (คำนวณใหม่ถ้า stale) */
  getWorkerGrade: async (userId: string): Promise<GradeData | null> => {
    try {
      const res = await api.get(`/workers/grade/${userId}`);
      // PostgreSQL returns DECIMAL as string — normalise to number
      const d = res.data;
      return {
        ...d,
        avg_rating:    parseFloat(d.avg_rating    ?? 0),
        total_reviews: parseInt  (d.total_reviews ?? 0),
        total_jobs:    parseInt  (d.total_jobs     ?? 0),
        success_rate:  parseFloat(d.success_rate  ?? 0),
        cert_count:    parseInt  (d.cert_count     ?? 0),
      } as GradeData;
    } catch (err) {
      console.error('[gradeService] getWorkerGrade:', err);
      return null;
    }
  },

  /** บังคับคำนวณ grade ใหม่ */
  recalculateGrade: async (userId: string): Promise<GradeData | null> => {
    try {
      const res = await api.post(`/workers/grade/${userId}/recalculate`);
      const d = res.data;
      return {
        ...d,
        avg_rating:    parseFloat(d.avg_rating    ?? 0),
        total_reviews: parseInt  (d.total_reviews ?? 0),
        total_jobs:    parseInt  (d.total_jobs     ?? 0),
        success_rate:  parseFloat(d.success_rate  ?? 0),
        cert_count:    parseInt  (d.cert_count     ?? 0),
      } as GradeData;
    } catch (err) {
      console.error('[gradeService] recalculateGrade:', err);
      return null;
    }
  },

  /** ส่งรีวิวพร้อมคะแนนรายหมวด */
  submitReview: async (payload: SubmitReviewPayload): Promise<{ review_id: string; new_grade: GradeData } | null> => {
    try {
      const res = await api.post('/reviews', payload);
      return res.data;
    } catch (err) {
      console.error('[gradeService] submitReview:', err);
      return null;
    }
  },

  /** ดึงรีวิวทั้งหมดของ worker */
  getWorkerReviews: async (
    userId: string,
    limit = 20,
    offset = 0
  ): Promise<{ reviews: WorkerReview[]; stats: ReviewStats; total: number } | null> => {
    try {
      const res = await api.get(`/reviews/worker/${userId}?limit=${limit}&offset=${offset}`);
      const { reviews, stats, total } = res.data;
      // Normalise all DECIMAL fields from PostgreSQL (they arrive as strings)
      const normaliseStats = (s: any): ReviewStats => ({
        avg_overall:        parseFloat(s?.avg_overall        ?? 0),
        avg_quality:        parseFloat(s?.avg_quality        ?? 0),
        avg_punctuality:    parseFloat(s?.avg_punctuality    ?? 0),
        avg_attitude:       parseFloat(s?.avg_attitude       ?? 0),
        avg_cleanliness:    parseFloat(s?.avg_cleanliness    ?? 0),
        avg_communication:  parseFloat(s?.avg_communication  ?? 0),
        total_reviews:      parseInt  (s?.total_reviews      ?? 0),
      });
      return { reviews: reviews ?? [], stats: normaliseStats(stats), total: parseInt(total ?? 0) };
    } catch (err) {
      console.error('[gradeService] getWorkerReviews:', err);
      return null;
    }
  },

  /** มาร์ก job เป็น VVIP (client/admin) */
  setJobVvip: async (jobId: string, isVvip: boolean, minGrade: WorkerGrade = 'A'): Promise<boolean> => {
    try {
      await api.patch(`/jobs/${jobId}/set-vvip`, { is_vvip: isVvip, min_grade: minGrade });
      return true;
    } catch {
      return false;
    }
  },

  // ── Admin Governance ───────────────────────────────────────────────

  /** ดึงรีวิวทั้งหมด (Admin) พร้อม AI flag */
  adminGetReviews: async (flaggedOnly = false, limit = 50, offset = 0) => {
    const res = await api.get(`/admin/reviews?flagged=${flaggedOnly}&limit=${limit}&offset=${offset}`);
    return res.data as { reviews: AdminReview[]; total: number };
  },

  /** Verify รีวิว (Admin) */
  adminVerifyReview: async (reviewId: string, verified = true) => {
    await api.patch(`/admin/reviews/${reviewId}/verify`, { verified });
  },

  /** Flag รีวิว (Admin) */
  adminFlagReview: async (reviewId: string, isFlagged: boolean, reason = '') => {
    await api.patch(`/admin/reviews/${reviewId}/flag`, { is_flagged: isFlagged, flagged_reason: reason });
  },

  /** Shadow Ban worker (Admin) */
  adminShadowBan: async (workerId: string, reason = '') => {
    await api.patch(`/admin/workers/${workerId}/shadow-ban`, { reason });
  },

  /** ยกเลิก Shadow Ban (Admin) */
  adminLiftBan: async (workerId: string) => {
    await api.patch(`/admin/workers/${workerId}/shadow-ban/lift`, {});
  },

  /** ดึงรายการ Dispute (Admin) */
  adminGetDisputes: async (status: 'pending' | 'resolved' | 'all' = 'pending') => {
    const res = await api.get(`/admin/disputes?status=${status}`);
    return res.data as { disputes: AdminDispute[] };
  },

  /** Resolve Dispute (Admin) */
  adminResolveDispute: async (reviewId: string, resolution: string, favor: 'worker' | 'client') => {
    await api.patch(`/admin/disputes/${reviewId}/resolve`, { resolution, favor });
  },

  /** ดึงรายการ Workers (Admin) */
  adminGetWorkers: async (grade?: WorkerGrade, limit = 50) => {
    const gradeParam = grade ? `&grade=${grade}` : '';
    const res = await api.get(`/admin/workers?limit=${limit}${gradeParam}`);
    return res.data as { workers: AdminWorker[] };
  },
};

// ── Admin Types ────────────────────────────────────────────────────────

export interface AdminReview extends WorkerReview {
  reviewer_id:     string;
  reviewee_id:     string;
  reviewee_name:   string;
  worker_grade:    WorkerGrade;
  shadow_banned_at?: string | null;
  is_flagged:      boolean;
  flagged_reason?: string;
  is_verified:     boolean;
  dispute_status:  'none' | 'pending' | 'resolved';
  dispute_images?: string[];
  ai_flag?:        string | null;
}

export interface AdminDispute {
  id:                  string;
  job_id:              string;
  comment:             string;
  rating_overall:      number;
  dispute_text:        string;
  dispute_images:      string[];
  dispute_status:      string;
  dispute_resolution?: string;
  flagged_reason?:     string;
  created_at:          string;
  reviewer_name:       string;
  reviewee_name:       string;
  reviewee_id:         string;
}

export interface AdminWorker {
  id:               string;
  full_name:        string;
  email:            string;
  worker_grade:     WorkerGrade;
  shadow_banned_at?: string | null;
  ban_reason?:      string;
  avg_rating:       number;
  total_reviews:    number;
  total_jobs:       number;
  success_rate:     number;
  cert_count:       number;
  is_vvip_eligible: boolean;
  last_calculated?: string;
}

export default gradeService;
