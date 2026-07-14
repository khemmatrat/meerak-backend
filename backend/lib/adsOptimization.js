/**
 * Phase F — Ads optimization engine (quality score, auto-pause, budget recommender).
 */

const AUTO_PAUSE_MIN_IMPRESSIONS = 500;
const AUTO_PAUSE_CVR_RATIO = 0.5;
const WARN_BEFORE_PAUSE_HOURS = 24;

export function computeCreativeQualityScore(meta = {}) {
  const counts = meta.renderHealth?.counts || {};
  const viewable = (counts.ad_viewable_1s || 0) + (counts.ad_video_view_2s || 0);
  const failed = (counts.ad_media_failed || 0) + (counts.ad_media_failed_timeout || 0);
  const rendered = counts.ad_rendered || 0;
  const clicks = counts.ad_cta_clicked || 0;
  const denom = Math.max(rendered, viewable + failed, 1);

  let score = Number(meta.qualityScore ?? 50);
  if (meta.renderHealth?.counts) {
    score = 45;
    score += Math.min(30, Math.round((viewable / denom) * 30));
    score -= Math.min(25, Math.round((failed / denom) * 25));
    if (viewable > 0) score += Math.min(15, Math.round((clicks / viewable) * 15));
    if (meta.renderPreflightStatus === 'PASS') score += 10;
    if (meta.processingStatus === 'READY') score += 5;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function buildCreativeRecommendations(qualityScore, meta = {}) {
  const recs = [];
  const counts = meta.renderHealth?.counts || {};
  const failed = (counts.ad_media_failed || 0) + (counts.ad_media_failed_timeout || 0);

  if (qualityScore < 50) {
    recs.push({
      type: 'creative',
      severity: 'high',
      title: 'คุณภาพสื่อต่ำ',
      message: 'อัปโหลดวิดีโอ/รูปใหม่ที่ชัดกว่า หรือใช้ poster ที่อ่านง่าย — สื่อคุณภาพต่ำจะได้รับการแสดงน้อยลง',
    });
  } else if (qualityScore < 70) {
    recs.push({
      type: 'creative',
      severity: 'medium',
      title: 'ปรับปรุงสื่อได้อีก',
      message: 'เพิ่ม viewability ด้วยข้อความสั้น ๆ บนภาพ และ CTA ที่ชัดเจน',
    });
  }

  if (failed >= 3) {
    recs.push({
      type: 'render',
      severity: 'high',
      title: 'สื่อโหลดไม่สำเร็จบ่อย',
      message: `พบ render fail ${failed} ครั้ง — ลองอัปโหลด MP4 H.264 หรือรูป JPG/PNG ขนาดเล็กลง`,
    });
  }

  if (meta.renderPreflightStatus && meta.renderPreflightStatus !== 'PASS') {
    recs.push({
      type: 'preflight',
      severity: 'high',
      title: 'สื่อยังไม่ผ่าน preflight',
      message: meta.renderPreflightReason
        ? String(meta.renderPreflightReason)
        : 'รอประมวลผลสื่อให้เสร็จก่อนเปิดแคมเปญ',
    });
  }

  return recs;
}

export function evaluateLowCvrAutoPause({ impressions, cvr, benchmarkCvr }) {
  const imps = Number(impressions || 0);
  const cvrVal = Number(cvr || 0);
  const bench = Number(benchmarkCvr || 0);
  if (imps < AUTO_PAUSE_MIN_IMPRESSIONS || bench <= 0) {
    return { eligible: false, reason: 'insufficient_data' };
  }
  const threshold = bench * AUTO_PAUSE_CVR_RATIO;
  if (cvrVal >= threshold) {
    return { eligible: false, reason: 'cvr_ok' };
  }
  return {
    eligible: true,
    reason: 'cvr_below_benchmark',
    impressions: imps,
    cvr: cvrVal,
    benchmarkCvr: bench,
    thresholdCvr: Math.round(threshold * 100) / 100,
  };
}

export function computeBudgetRecommendation({ insights, escrow, addThb = 100 }) {
  const outcomes = Number(insights?.periodOutcomes ?? insights?.conversions ?? 0);
  const spentMicro = BigInt(escrow?.spentMicro ?? insights?.spendMicro ?? 0);
  const spentThb = Number(spentMicro) / 1_000_000;
  const remainingMicro = escrow?.remainingMicro
    ? BigInt(escrow.remainingMicro)
    : escrow?.escrowMicro
      ? BigInt(escrow.escrowMicro) - spentMicro
      : BigInt(0);
  const remainingThb = Number(remainingMicro) / 1_000_000;
  const outcomeCostThb = Number(escrow?.outcomeCostMicro ?? 50000) / 1_000_000;
  const maxSlotsFromAdd = Math.floor(addThb / outcomeCostThb);

  let projectedAdditionalOutcomes = 0;
  let basis = 'conservative_default';

  if (spentThb > 0 && outcomes > 0) {
    projectedAdditionalOutcomes = Math.max(1, Math.round((addThb / spentThb) * outcomes));
    basis = 'historical_spend_outcome_ratio';
  } else {
    const clicks = Number(insights?.periodClicks ?? insights?.clicks ?? 0);
    const cvrPct = Number(insights?.periodCvr ?? 0);
    if (clicks > 0 && cvrPct > 0) {
      const estClicksFromAdd = Math.round(clicks * (addThb / Math.max(spentThb, addThb, 1)));
      projectedAdditionalOutcomes = Math.max(1, Math.round(estClicksFromAdd * (cvrPct / 100)));
      basis = 'historical_cvr';
    } else {
      projectedAdditionalOutcomes = Math.max(1, Math.round(maxSlotsFromAdd * 0.05));
      basis = 'escrow_capacity_estimate';
    }
  }

  projectedAdditionalOutcomes = Math.min(projectedAdditionalOutcomes, maxSlotsFromAdd);

  return {
    addThb,
    projectedAdditionalOutcomes,
    maxOutcomeSlots: maxSlotsFromAdd,
    remainingEscrowThb: Math.round(remainingThb * 100) / 100,
    basis,
    disclaimer: 'ประมาณการจากผลลัพธ์ย้อนหลัง — ไม่ใช่การรับประกัน',
  };
}

export function buildOptimizationReport({ insights, creativeMeta, escrow, objective, variants = [] }) {
  const qualityScore = computeCreativeQualityScore(creativeMeta || {});
  const recommendations = buildCreativeRecommendations(qualityScore, creativeMeta || {});

  const impressions = insights?.periodImpressions ?? insights?.impressions ?? 0;
  const cvr = insights?.periodCvr ?? 0;
  const benchmarkCvr = insights?.benchmark?.medianCvr ?? 0;
  const autoPauseEval = evaluateLowCvrAutoPause({ impressions, cvr, benchmarkCvr });

  if (autoPauseEval.eligible) {
    recommendations.push({
      type: 'cvr',
      severity: 'critical',
      title: 'CVR ต่ำกว่าแพลตฟอร์ม',
      message: `CVR ${cvr}% ต่ำกว่าเกณฑ์ ${autoPauseEval.thresholdCvr}% (50% ของ median ${benchmarkCvr}%) — ระบบอาจหยุดแคมเปญอัตโนมัติหากไม่ปรับปรุง`,
      autoPauseEligible: true,
    });
  }

  const budgetRecommendation =
    escrow?.billingModel === 'OUTCOME_ONLY' || escrow
      ? computeBudgetRecommendation({ insights, escrow })
      : null;

  const abActive = variants.length >= 2;

  return {
    campaignId: insights?.campaignId,
    objective: objective || null,
    qualityScore,
    qualityLabel:
      qualityScore >= 80 ? 'ดีเยี่ยม' : qualityScore >= 65 ? 'ดี' : qualityScore >= 50 ? 'ปานกลาง' : 'ต้องปรับปรุง',
    recommendations,
    autoPause: autoPauseEval,
    budgetRecommendation,
    abTestReady: abActive,
    abTestNote: abActive
      ? `A/B เปิดใช้งาน — ${variants.length} variants (สลับตาม impressions)`
      : 'ลงทะเบียน variant B เพื่อเปิด A/B test',
    variants: variants.map((v) => ({
      variantKey: v.variant_key,
      creativeId: v.creative_id,
      impressions: v.impressions,
      clicks: v.clicks,
      qualityScore: v.quality_score,
    })),
  };
}

export async function getRecentOptimizationAction(pool, campaignId, action, withinHours = 24) {
  const r = await pool.query(
    `SELECT * FROM ad_campaign_optimization_log
     WHERE campaign_id = $1 AND action = $2
       AND created_at >= NOW() - ($3::text || ' hours')::interval
     ORDER BY created_at DESC LIMIT 1`,
    [campaignId, action, String(withinHours)],
  );
  return r.rows[0] || null;
}

export async function logOptimizationAction(pool, { campaignId, action, reason, metrics = {} }) {
  const r = await pool.query(
    `INSERT INTO ad_campaign_optimization_log (campaign_id, action, reason, metrics)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING *`,
    [campaignId, action, reason || null, JSON.stringify(metrics)],
  );
  return r.rows[0];
}

export async function ensurePrimaryCreativeVariant(pool, { campaignId, creativeId, qualityScore }) {
  await pool
    .query(
      `INSERT INTO ad_campaign_creative_variants (
        campaign_id, creative_id, variant_key, is_primary, quality_score, status
      ) VALUES ($1, $2, 'A', true, $3, 'active')
      ON CONFLICT (campaign_id, variant_key) DO UPDATE SET
        creative_id = EXCLUDED.creative_id,
        quality_score = COALESCE(EXCLUDED.quality_score, ad_campaign_creative_variants.quality_score)`,
      [campaignId, creativeId, qualityScore ?? null],
    )
    .catch(() => null);
}
