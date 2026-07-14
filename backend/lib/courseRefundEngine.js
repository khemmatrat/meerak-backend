/**
 * Course refund eligibility — isolated from job/booking refund flows.
 */

export const DEFAULT_REFUND_POLICY = {
  guaranteeDays: 7,
  maxProgressPct: 20,
  allowAdminOverride: true,
};

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function normalizeCourseRefundPolicy(raw = {}) {
  const guaranteeDays = Number(raw.guaranteeDays ?? raw.guarantee_days ?? DEFAULT_REFUND_POLICY.guaranteeDays);
  const maxProgressPct = Number(raw.maxProgressPct ?? raw.max_progress_pct ?? DEFAULT_REFUND_POLICY.maxProgressPct);
  return {
    guaranteeDays: Number.isFinite(guaranteeDays) && guaranteeDays >= 0 ? Math.min(guaranteeDays, 90) : 7,
    maxProgressPct: Number.isFinite(maxProgressPct) && maxProgressPct >= 0 ? Math.min(maxProgressPct, 100) : 20,
    allowAdminOverride: raw.allowAdminOverride !== false && raw.allow_admin_override !== false,
  };
}

export function normalizeCoursePayoutPolicy(raw = {}) {
  const holdDays = Number(raw.holdDays ?? raw.hold_days ?? 7);
  return {
    holdDays: Number.isFinite(holdDays) && holdDays >= 0 ? Math.min(holdDays, 90) : 7,
    releaseToWithdrawable: raw.releaseToWithdrawable !== false && raw.release_to_withdrawable !== false,
    blockOnRefund: raw.blockOnRefund !== false && raw.block_on_refund !== false,
    applyProviderWht: raw.applyProviderWht !== false && raw.apply_provider_wht !== false,
  };
}

export function computePayoutReleaseAt(purchasedAt, policy = {}) {
  const normalized = normalizeCoursePayoutPolicy(policy);
  const base = purchasedAt ? new Date(purchasedAt) : new Date();
  const ts = base.getTime();
  if (!Number.isFinite(ts)) return new Date(Date.now() + normalized.holdDays * 86400000);
  return new Date(ts + normalized.holdDays * 86400000);
}

export function evaluateCourseRefundEligibility({
  order,
  enrollment,
  policy,
  now = Date.now(),
  adminOverride = false,
}) {
  const rules = normalizeCourseRefundPolicy(policy);
  const status = String(order?.status || '').toLowerCase();
  const refundStatus = String(order?.refund_status || 'none').toLowerCase();

  if (!order) {
    return { eligible: false, code: 'order_not_found', reason: 'ไม่พบคำสั่งซื้อ' };
  }
  if (status === 'refunded' || refundStatus === 'completed') {
    return { eligible: false, code: 'already_refunded', reason: 'คืนเงินแล้ว' };
  }
  if (status !== 'completed') {
    return { eligible: false, code: 'order_not_completed', reason: 'คำสั่งซื้อยังไม่สมบูรณ์' };
  }
  if (adminOverride && rules.allowAdminOverride) {
    return {
      eligible: true,
      code: 'admin_override',
      reason: 'Admin override',
      policy: rules,
      progressPct: round2(enrollment?.progress_pct ?? enrollment?.progressPct ?? 0),
    };
  }

  const purchasedAt = order.created_at ? new Date(order.created_at).getTime() : NaN;
  const ageDays = Number.isFinite(purchasedAt) ? (now - purchasedAt) / 86400000 : Infinity;
  if (ageDays > rules.guaranteeDays) {
    return {
      eligible: false,
      code: 'guarantee_expired',
      reason: `เกินระยะการันตี ${rules.guaranteeDays} วัน`,
      policy: rules,
      ageDays: round2(ageDays),
    };
  }

  const progressPct = round2(enrollment?.progress_pct ?? enrollment?.progressPct ?? 0);
  if (progressPct > rules.maxProgressPct) {
    return {
      eligible: false,
      code: 'progress_exceeded',
      reason: `เรียนไปแล้ว ${progressPct}% (เกิน ${rules.maxProgressPct}%)`,
      policy: rules,
      progressPct,
    };
  }

  return {
    eligible: true,
    code: 'eligible',
    reason: 'เข้าเงื่อนไขการันตีคืนเงิน',
    policy: rules,
    progressPct,
    ageDays: round2(ageDays),
  };
}
