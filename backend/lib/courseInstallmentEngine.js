/**
 * Course BNPL / wallet credit line — isolated from job payment flows.
 */

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function normalizeInstallmentPolicy(raw = {}) {
  const inst = raw.installment || raw.bnpl || {};
  const installmentCount = Math.min(6, Math.max(2, Number(inst.installmentCount ?? inst.installments ?? 3)));
  const downPaymentRate = Number(inst.downPaymentRate ?? inst.down_payment_rate ?? 0.34);
  return {
    enabled: inst.enabled !== false,
    minGrossThb: Number(inst.minGrossThb ?? inst.min_gross_thb ?? 300),
    installmentCount: Number.isFinite(installmentCount) ? installmentCount : 3,
    downPaymentRate: Number.isFinite(downPaymentRate) && downPaymentRate > 0 && downPaymentRate < 1
      ? downPaymentRate
      : 0.34,
    defaultCreditLineThb: Number(inst.defaultCreditLineThb ?? inst.default_credit_line_thb ?? 3000),
  };
}

/**
 * @param {{ grossAmount: number, walletBalance: number, creditLineLimit: number, creditLineUsed: number, policy?: object }} input
 */
export function computeInstallmentPlan(input) {
  const norm = normalizeInstallmentPolicy(input.policy || {});
  const grossAmount = round2(Math.max(0, Number(input.grossAmount || 0)));
  if (!norm.enabled || grossAmount < norm.minGrossThb) {
    return { eligible: false, reason: grossAmount < norm.minGrossThb ? 'below_min_gross' : 'disabled' };
  }

  const creditAvailable = round2(Math.max(0, Number(input.creditLineLimit || 0) - Number(input.creditLineUsed || 0)));
  const targetDown = round2(grossAmount * norm.downPaymentRate);
  const walletDown = round2(Math.min(Number(input.walletBalance || 0), targetDown));
  const creditPrincipal = round2(Math.max(0, grossAmount - walletDown));
  const installmentAmount = norm.installmentCount > 0
    ? round2(creditPrincipal / norm.installmentCount)
    : 0;

  return {
    eligible: creditPrincipal <= creditAvailable,
    minGrossThb: norm.minGrossThb,
    installmentCount: norm.installmentCount,
    targetDownPayment: targetDown,
    walletDown,
    creditPrincipal,
    creditAvailable,
    installmentAmount,
    totalGross: grossAmount,
    reason: creditPrincipal > creditAvailable ? 'insufficient_credit_line' : null,
  };
}

export function buildInstallmentSchedule(creditPrincipal, installmentCount, startDate = new Date()) {
  const amount = installmentCount > 0 ? round2(creditPrincipal / installmentCount) : 0;
  const rows = [];
  for (let seq = 1; seq <= installmentCount; seq += 1) {
    const due = new Date(startDate);
    due.setDate(due.getDate() + seq * 30);
    rows.push({
      seq,
      dueAt: due.toISOString(),
      amount: seq === installmentCount
        ? round2(creditPrincipal - amount * (installmentCount - 1))
        : amount,
    });
  }
  return rows;
}
