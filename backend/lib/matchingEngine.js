/**
 * Matching spine — ใช้ร่วมกันระหว่าง Job board (recommended), provider match, และ booking ภายหลัง
 * น้ำหนักปรับได้ผ่าน MATCHING_WEIGHTS_JSON ใน env (object 0–1 รวมกัน ~1)
 */

const DEFAULT_WEIGHTS = {
  category: 0.25,
  distance: 0.25,
  grade: 0.15,
  rating: 0.2,
  completion: 0.1,
  cancellation: 0.05,
};

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

/** ระยะทางพื้นผิวโลก (กม.) */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const a1 = parseFloat(lat1);
  const o1 = parseFloat(lng1);
  const a2 = parseFloat(lat2);
  const o2 = parseFloat(lng2);
  if (![a1, o1, a2, o2].every(Number.isFinite)) return null;
  const R = 6371;
  const dLat = ((a2 - a1) * Math.PI) / 180;
  const dLng = ((o2 - o1) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a1 * Math.PI) / 180) * Math.cos((a2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

export function parseLocation(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && raw.lat != null && raw.lng != null) {
    const lat = parseFloat(raw.lat);
    const lng = parseFloat(raw.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return parseLocation(o);
    } catch {
      return null;
    }
  }
  return null;
}

export function getMatchingWeights() {
  const raw = process.env.MATCHING_WEIGHTS_JSON;
  if (raw) {
    try {
      const p = JSON.parse(raw);
      return { ...DEFAULT_WEIGHTS, ...p };
    } catch {
      /* fallthrough */
    }
  }
  return { ...DEFAULT_WEIGHTS };
}

export function providerCategoryMatchesJob(jobCategory, row) {
  const jc = (jobCategory || '').toLowerCase().trim();
  if (!jc) return true;
  const exp = (row.expert_category || '').toLowerCase();
  if (exp && (exp === jc || exp.includes(jc) || jc.includes(exp))) return true;
  let skills = [];
  try {
    const sj = row.skills_json;
    skills = Array.isArray(sj) ? sj : sj ? JSON.parse(sj) : [];
  } catch {
    skills = [];
  }
  return skills.some((s) => {
    const sc = (s?.skill_category || '').toLowerCase();
    const sn = (s?.skill_name || '').toLowerCase();
    return (
      (sc && (sc === jc || sc.includes(jc) || jc.includes(sc))) ||
      (sn && (sn.includes(jc) || jc.includes(sn)))
    );
  });
}

function gradeToScore(gradeChar) {
  const g = (gradeChar || 'C').toUpperCase().charAt(0);
  if (g === 'A') return 1;
  if (g === 'B') return 2 / 3;
  return 1 / 3;
}

/**
 * คะแนนย่อย 0–1 สำหรับ provider เทียบงาน
 * @param {object} opts
 * @param {string} opts.jobCategory
 * @param {number|null} opts.jobLat
 * @param {number|null} opts.jobLng
 * @param {object} opts.providerRow - แถวจาก DB (มี location, worker_grade, rating, total_jobs ฯลฯ)
 * @param {number|null} [opts.cancellationRate] - 0–1 ถ้ามีใน DB ภายหลัง; ไม่มีใช้ null
 */
export function computeProviderMatchComponents(opts) {
  const { jobCategory, jobLat, jobLng, providerRow, cancellationRate } = opts;
  const row = providerRow || {};
  const loc = parseLocation(row.location);
  const plat = loc?.lat;
  const plng = loc?.lng;

  let distanceKm = null;
  if (jobLat != null && jobLng != null && plat != null && plng != null) {
    distanceKm = haversineKm(jobLat, jobLng, plat, plng);
  }

  const categoryMatch = providerCategoryMatchesJob(jobCategory, row) ? 1 : 0;

  let distanceScore = 0.5;
  if (distanceKm != null && Number.isFinite(distanceKm)) {
    distanceScore = clamp01(1 - Math.min(distanceKm, 80) / 80);
  }

  const gradeScore = gradeToScore(row.worker_grade);
  const ratingVal = parseFloat(row.rating);
  const ratingScore = Number.isFinite(ratingVal) ? clamp01(ratingVal / 5) : 0;

  const completed = parseInt(row.completed_jobs_count ?? row.total_jobs ?? 0, 10) || 0;
  const completionScore = clamp01(completed / 50);

  let cancellationScore = 0.5;
  if (cancellationRate != null && Number.isFinite(cancellationRate)) {
    cancellationScore = clamp01(1 - cancellationRate);
  }

  return {
    category_match: categoryMatch,
    distance_km: distanceKm != null ? Math.round(distanceKm * 100) / 100 : null,
    distance: distanceScore,
    grade: gradeScore,
    rating: ratingScore,
    completion_rate: completionScore,
    cancellation_rate: cancellationScore,
  };
}

export function weightedTotalScore(components, weights) {
  const w = weights || getMatchingWeights();
  const sum =
    w.category * components.category_match +
    w.distance * components.distance +
    w.grade * components.grade +
    w.rating * components.rating +
    w.completion * components.completion_rate +
    w.cancellation * components.cancellation_rate;
  return Math.min(100, Math.round(sum * 100));
}

/** เหตุผลสั้นๆ ภาษาไทยสำหรับ UI (ลำดับความสำคัญบน marketplace) */
export function buildProviderMatchReasonsTh(components, { categoryMatch } = {}) {
  const reasons = [];
  const cm = categoryMatch !== undefined ? categoryMatch : components.category_match >= 0.5;
  if (cm) reasons.push({ code: 'skill_match', label_th: 'ตรงหมวด/ทักษะ' });
  if (components.distance_km != null && components.distance_km <= 5) {
    reasons.push({ code: 'nearby', label_th: 'ใกล้พื้นที่งาน' });
  } else if (components.distance_km != null && components.distance_km <= 15) {
    reasons.push({ code: 'reasonable_distance', label_th: 'ระยะทางเหมาะสม' });
  }
  if (components.rating >= 0.8) reasons.push({ code: 'high_rating', label_th: 'เรตติ้งสูง' });
  else if (components.rating >= 0.6) reasons.push({ code: 'good_rating', label_th: 'เรตติ้งดี' });
  if (components.grade >= 0.85) reasons.push({ code: 'grade_a', label_th: 'เกรด A' });
  if (components.completion_rate >= 0.4) reasons.push({ code: 'experienced', label_th: 'ประสบการณ์รับงาน' });
  if (reasons.length === 0 && components.distance_km != null) {
    reasons.push({ code: 'distance', label_th: 'เรียงตามระยะและคุณภาพ' });
  }
  return reasons.slice(0, 4);
}

/** สำหรับ job card ฝั่งผู้รับงาน — เหตุผลที่แนะนำงานนี้ */
export function buildJobRecommendReasonsTh({ skillMatch, distanceKm }) {
  const reasons = [];
  if (skillMatch) reasons.push({ code: 'skill_match', label_th: 'ตรงทักษะของคุณ' });
  if (distanceKm != null && distanceKm <= 5) reasons.push({ code: 'nearby', label_th: 'ใกล้คุณ' });
  else if (distanceKm != null && distanceKm <= 20) reasons.push({ code: 'reachable', label_th: 'อยู่ในระยะที่ไปถึงได้' });
  if (reasons.length === 0) reasons.push({ code: 'fresh', label_th: 'งานล่าสุด' });
  return reasons.slice(0, 3);
}
