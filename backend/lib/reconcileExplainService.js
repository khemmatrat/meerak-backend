/**
 * Reconcile variance explanation — deposits/withdrawals vs job income/expenses.
 */

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n) {
  return Math.round(num(n) * 100) / 100;
}

/**
 * @param {{
 *   walletBalance: number,
 *   depNet: number,
 *   wdGross: number,
 *   adminCr: number,
 *   adminDb: number,
 *   jobEarnings: number,
 *   jobExpenses: number,
 *   walletPending?: number,
 *   pendingSettlement?: number,
 *   otherLocked?: number,
 * }} input
 */
export function buildReconcileExplain(input) {
  const walletBalance = round2(input.walletBalance);
  const depNet = round2(input.depNet);
  const wdGross = round2(input.wdGross);
  const adminCr = round2(input.adminCr);
  const adminDb = round2(input.adminDb);
  const jobEarnings = round2(input.jobEarnings);
  const jobExpenses = round2(input.jobExpenses);
  const walletPending = round2(input.walletPending ?? 0);
  const pendingSettlement = round2(input.pendingSettlement ?? 0);
  const otherLocked = round2(input.otherLocked ?? 0);

  const simpleExpected = round2(depNet - wdGross + adminCr - adminDb);
  const simpleVariance = round2(walletBalance - simpleExpected);

  const explainedExpected = round2(
    simpleExpected + jobEarnings - jobExpenses,
  );
  const explainedVariance = round2(walletBalance - explainedExpected);

  const breakdown = [
    { key: 'deposits_net', label: 'เติมเงินสำเร็จ (net)', amount: depNet, effect: 'credit' },
    { key: 'withdrawals_gross', label: 'ถอนสำเร็จ (gross)', amount: wdGross, effect: 'debit' },
    { key: 'admin_credits', label: 'Admin เติม', amount: adminCr, effect: 'credit' },
    { key: 'admin_debits', label: 'Admin หัก', amount: adminDb, effect: 'debit' },
    { key: 'job_earnings', label: 'รายได้งาน / escrow release / referral', amount: jobEarnings, effect: 'credit' },
    { key: 'job_expenses', label: 'จ่ายงาน (employer side)', amount: jobExpenses, effect: 'debit' },
  ];

  const walletState = [
    { key: 'wallet_pending', label: 'wallet_pending (รอ release)', amount: walletPending },
    { key: 'pending_settlement', label: 'รอ settlement PaySo', amount: pendingSettlement },
    { key: 'other_locked', label: 'lock อื่นๆ', amount: otherLocked },
  ].filter((r) => Math.abs(r.amount) >= 0.01);

  const simplePass = Math.abs(simpleVariance) < 0.01;
  const explainedPass = Math.abs(explainedVariance) < 0.01;

  let verdict = 'unknown';
  let verdict_th = 'ต้องสืบ ledger เพิ่ม';
  if (simplePass) {
    verdict = 'pass_simple';
    verdict_th = 'สูตรเติม−ถอน ตรง';
  } else if (explainedPass) {
    verdict = 'pass_explained';
    verdict_th = 'ต่างเพราะรายได้/จ่ายงาน — สูตรขยายตรงแล้ว';
  } else if (Math.abs(explainedVariance) < Math.abs(simpleVariance) * 0.25) {
    verdict = 'mostly_explained';
    verdict_th = 'ส่วนใหญ่อธิบายได้จากงาน — เหลือต่างเล็กน้อย ตรวจ ledger ค้าง';
  } else if (jobEarnings > 0 && simpleVariance > 0) {
    verdict = 'likely_job_income';
    verdict_th = 'น่าจะเป็นรายได้จากงาน (provider) — สูตรเติม−ถอนไม่รวมรายได้งาน';
  } else {
    verdict = 'investigate';
    verdict_th = 'ยังอธิบายไม่ครบ — สืบ payment_ledger_audit / wallet_transactions';
  }

  return {
    simple: {
      expected_balance: simpleExpected,
      variance: simpleVariance,
      formula: 'เติมสำเร็จ − ถอนสำเร็จ + admin เติม − admin หัก',
      status: simplePass ? 'pass' : 'warn',
    },
    explained: {
      expected_balance: explainedExpected,
      variance: explainedVariance,
      formula: 'สูตรเติม−ถอน + รายได้งาน − จ่ายงาน',
      status: explainedPass ? 'pass' : 'warn',
    },
    breakdown,
    wallet_state: walletState,
    verdict,
    verdict_th,
    primary_variance: simplePass ? explainedVariance : simpleVariance,
    use_explained_formula: !simplePass && (explainedPass || verdict === 'likely_job_income' || verdict === 'mostly_explained'),
  };
}
