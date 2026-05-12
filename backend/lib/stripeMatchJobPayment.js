/**
 * Stripe PaymentIntent + webhook finalize — Match jobs (jobs table) only.
 * Amounts mirror /api/payments/process (financialEngine + insurance + VIP + coach path).
 */
import Stripe from 'stripe';
import {
  calcMatchJobProviderInflow,
  buildMatchJobLedgerMetadata,
} from './financialEngine.js';
import {
  calcEmployerOutflowWithMarkupRate,
  getTransportMatchMarkupRate,
} from './paymentProviderGate.js';
import { generateTaxRefIdForInsert } from './taxIdService.js';
import { calcVipAdminFundSiphon } from './aqondPayFees.js';
import { isPlatformCommissionWaivedForUser } from './brandAdviser.js';
import { onJobCompleted } from './referralService.js';

const VIP_TIERS = {
  none: { quotaPerMonth: 0, discountPercent: 0, priceMonthly: 0 },
  silver: { quotaPerMonth: 12, discountPercent: 5, priceMonthly: 399 },
  gold: { quotaPerMonth: 30, discountPercent: 5, priceMonthly: 999 },
  platinum: { quotaPerMonth: -1, discountPercent: 5, priceMonthly: 1999 },
};

function getVipDiscountEligibility(user) {
  if (!user) return { eligible: false, discountPercent: 0, quotaLeft: 0, tier: 'none' };
  const tier = (user.vip_tier || 'none').toLowerCase();
  if (tier === 'none') return { eligible: false, discountPercent: 0, quotaLeft: 0, tier: 'none' };
  const config = VIP_TIERS[tier] || VIP_TIERS.none;
  if (!config || config.quotaPerMonth === 0) return { eligible: false, discountPercent: 0, quotaLeft: 0, tier };
  const expiry = user.vip_expiry ? new Date(user.vip_expiry) : null;
  if (expiry && expiry.getTime() < Date.now()) return { eligible: false, discountPercent: 0, quotaLeft: 0, tier };
  const quotaLeft = user.vip_quota_balance != null ? parseInt(user.vip_quota_balance, 10) : 0;
  const hasQuota = config.quotaPerMonth === -1 || quotaLeft > 0;
  return {
    eligible: hasQuota && config.discountPercent > 0,
    discountPercent: config.discountPercent,
    quotaLeft: config.quotaPerMonth === -1 ? Infinity : Math.max(0, quotaLeft),
    tier,
  };
}

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function getStripeSecret() {
  return (
    process.env.STRIPE_SECRET_KEY ||
    process.env.STRIPE_SECRET_KEY_TEST ||
    ''
  ).trim();
}

function getStripePublishable() {
  return (
    process.env.STRIPE_PUBLISHABLE_KEY ||
    process.env.STRIPE_PUBLISHABLE_KEY_TEST ||
    ''
  ).trim();
}

function getStripeWebhookSecret() {
  return (
    process.env.STRIPE_WEBHOOK_SECRET ||
    process.env.STRIPE_WEBHOOK_SECRET_TEST ||
    ''
  ).trim();
}

/** ชื่อบนสรุปรายการบัตร — ต้องตรงกับ VITE_STRIPE_STATEMENT_DESCRIPTOR ใน mobile (ค่าเริ่มต้น AQOND PLATFORM) สูงสุด 22 ตัวอักษร */
function getStripeStatementDescriptor() {
  const raw = (process.env.STRIPE_STATEMENT_DESCRIPTOR || 'AQOND PLATFORM').trim() || 'AQOND PLATFORM';
  return raw.slice(0, 22);
}

let _stripe;
function getStripe() {
  const key = getStripeSecret();
  if (!key) throw new Error('missing_stripe_secret');
  if (!_stripe) _stripe = new Stripe(key);
  return _stripe;
}

async function findJob(pool, jobId) {
  const sid = String(jobId || '').trim();
  const r = await pool.query(`SELECT * FROM jobs WHERE id::text = $1`, [sid]);
  return r.rows?.[0] || null;
}

async function findUser(pool, id) {
  if (!id) return null;
  const r = await pool.query(
    `SELECT * FROM users WHERE id::text = $1 OR firebase_uid = $1 LIMIT 1`,
    [String(id).trim()]
  );
  return r.rows?.[0] || null;
}

/**
 * @returns {Promise<object>} context for transaction (same basis as /api/payments/process)
 */
export async function buildMatchJobPaymentContext(pool, jobId, options = {}) {
  const {
    effectiveDiscount = 0,
    hasInsurance: hasInsuranceOpt = false,
    maturityVoucherId = null,
    userId = null,
  } = options;

  let hasInsurance =
    hasInsuranceOpt === true ||
    hasInsuranceOpt === 'true';

  let effectiveDiscountFinal = Math.max(0, Number(effectiveDiscount) || 0);
  if (maturityVoucherId && userId) {
    const vRow = await pool
      .query(
        `SELECT id, remaining_baht, user_id FROM maturity_rewards_vouchers
         WHERE id = $1 AND user_id = $2 AND used_at IS NULL AND remaining_baht > 0
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [maturityVoucherId, String(userId)]
      )
      .catch(() => ({ rows: [] }));
    if (vRow.rows?.[0]) {
      effectiveDiscountFinal += Math.min(parseFloat(vRow.rows[0].remaining_baht || 0), 50);
    }
  }

  const job = await findJob(pool, jobId);
  if (!job) throw new Error('job_not_found');

  const markupRate = getTransportMatchMarkupRate();

  const jobPd =
    typeof job.payment_details === 'string'
      ? JSON.parse(job.payment_details || '{}')
      : job.payment_details || {};

  if (!hasInsurance && (jobPd.employer_wants_insurance === true || jobPd.employer_wants_insurance === 'true')) {
    hasInsurance = true;
  }

  const employerCashPosting = jobPd.employer_payment_method === 'cash';
  const employerCashHeld =
    employerCashPosting &&
    jobPd.cash_liability_status === 'held' &&
    round2(Number(jobPd.cash_liability_debit) || 0) > 0;

  const clientUser = await findUser(pool, job.created_by);
  const provider = await findUser(pool, job.accepted_by);
  if (!clientUser || !provider) throw new Error('user_not_found');

  const PAYMENT_MARKUP_RATE_FE = 0.05;
  const includesMarkup = jobPd.price_includes_payment_markup === true;

  let jobFee = round2(Math.max(0, Number(job.price) - effectiveDiscountFinal));
  let insuranceAmount = 0;
  let insuranceRatePercent = 10;
  try {
    let category = (job.category || 'default').toString().trim();
    const LEGACY_ALIAS = {
      maid: 'Cleaning',
      cleaning: 'Cleaning',
      ac_cleaning: 'AC Technician',
      delivery: 'Delivery',
      tutor: 'Tutor',
      repair: 'Repair',
      event: 'Event',
      photography: 'Photography',
      moving: 'Moving',
      pet_care: 'Pet Care',
      beauty: 'Beauty',
      tech_support: 'IT Support',
      driving: 'Driving',
      consulting: 'Accounting',
      teaching: 'Tutoring',
      logistics: 'Delivery',
      detective: 'Security',
      health: 'Medical',
      elder_care: 'Elderly',
      babysitting: 'Babysitter',
      cooking: 'Chef',
    };
    if (LEGACY_ALIAS[category.toLowerCase()]) category = LEGACY_ALIAS[category.toLowerCase()];
    const catRow = await pool
      .query(
        `SELECT rate_percent FROM insurance_rate_by_category WHERE LOWER(TRIM(category)) = LOWER(TRIM($1))`,
        [category]
      )
      .catch(() => ({ rows: [] }));
    if (catRow.rows[0] != null) {
      insuranceRatePercent = parseFloat(catRow.rows[0].rate_percent) || 10;
    } else {
      const defaultRow = await pool
        .query(`SELECT rate_percent FROM insurance_rate_by_category WHERE category = 'default'`)
        .catch(() => ({ rows: [] }));
      if (defaultRow.rows[0] != null) insuranceRatePercent = parseFloat(defaultRow.rows[0].rate_percent) || 10;
      else {
        const globalRow = await pool
          .query(`SELECT value FROM insurance_settings WHERE key = 'insurance_rate_percent'`)
          .catch(() => ({ rows: [] }));
        insuranceRatePercent = globalRow.rows[0] ? parseFloat(globalRow.rows[0].value) || 10 : 10;
      }
    }
  } catch (_) {
    insuranceRatePercent = 10;
  }
  const insuranceRate = insuranceRatePercent / 100;

  if (includesMarkup) {
    const totalGross = round2(Math.max(0, Number(job.price) - effectiveDiscountFinal));
    const transIns = round2(Number(jobPd.transport_insurance_amount) || 0);
    const base = round2(totalGross / (1 + markupRate));
    if (transIns > 0 && transIns <= base + 0.01) {
      insuranceAmount = transIns;
      jobFee = round2(base - transIns);
      hasInsurance = hasInsurance && insuranceAmount > 0;
    } else {
      jobFee = base;
      insuranceAmount = 0;
      if (hasInsurance && jobFee > 0) {
        insuranceAmount = round2(jobFee * insuranceRate);
        jobFee = round2(jobFee - insuranceAmount);
      }
    }
  } else if (hasInsurance && jobFee > 0) {
    insuranceAmount = round2(jobFee * insuranceRate);
  }

  const policyNumber =
    hasInsurance && insuranceAmount > 0
      ? `AQ-INS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(jobId).slice(-6).toUpperCase()}`
      : null;

  let employerOutflow = calcEmployerOutflowWithMarkupRate(jobFee, insuranceAmount, markupRate);
  let finalPrice = employerOutflow.finalPrice;
  if (includesMarkup) {
    finalPrice = round2(Math.max(0, Number(job.price) - effectiveDiscountFinal));
  }

  const waiveBaMatch = await isPlatformCommissionWaivedForUser(pool, job.accepted_by);
  const providerTier = provider.vip_tier || 'none';
  const providerInflow = calcMatchJobProviderInflow(jobFee, providerTier, {
    waivePlatformCommission: waiveBaMatch,
  });
  const {
    sourcingFee: handlingFeeAmount,
    platformCommission: commissionFeeAmount,
    taxServiceAmount,
    talentNet: providerReceiveInit,
  } = providerInflow;
  let providerReceive = providerReceiveInit;
  let feeAmount = round2(handlingFeeAmount + commissionFeeAmount + taxServiceAmount);
  const commissionRate = providerInflow.commissionRate;

  const clientVipRow = await pool
    .query('SELECT vip_tier, vip_quota_balance, vip_expiry FROM users WHERE id = $1::uuid LIMIT 1', [job.created_by])
    .catch(() => ({ rows: [] }));
  const clientVip = getVipDiscountEligibility(clientVipRow.rows[0] || null);
  let vipDiscountAmount = 0;
  let vipApplied = false;
  if (clientVip.eligible && feeAmount > 0) {
    vipDiscountAmount = round2(feeAmount * (clientVip.discountPercent / 100));
    feeAmount = round2(feeAmount - vipDiscountAmount);
    providerReceive = round2(jobFee - feeAmount);
    vipApplied = true;
  }

  let coachFeeAmount = 0;
  let coachId = null;
  let connectionId = null;
  const TRAINING_FEE_PERCENT = 0.03;
  const GRADUATE_JOBS_MIN = 15;
  const TRAINING_MONTHS = 3;
  try {
    const connRow = await pool.query(
      `SELECT c.id, c.coach_id, c.first_job_completed_at, c.training_end_at, c.status
       FROM coach_trainee_connections c
       WHERE c.trainee_id = $1 AND c.status = 'active' LIMIT 1`,
      [job.accepted_by]
    );
    if (connRow.rows?.length && providerReceive > 0) {
      const conn = connRow.rows[0];
      const now = new Date();
      let firstCompleted = conn.first_job_completed_at ? new Date(conn.first_job_completed_at) : null;
      let trainingEnd = conn.training_end_at ? new Date(conn.training_end_at) : null;
      const totalJobsAfter = (provider.completed_jobs_count || 0) + 1;

      if (!firstCompleted) {
        firstCompleted = now;
        trainingEnd = new Date(now.getTime() + TRAINING_MONTHS * 30 * 24 * 60 * 60 * 1000);
        await pool.query(
          `UPDATE coach_trainee_connections SET first_job_completed_at = NOW(), training_end_at = $1, updated_at = NOW() WHERE id = $2`,
          [trainingEnd, conn.id]
        );
      }

      if (now <= trainingEnd) {
        const gradeRow = await pool.query(`SELECT grade FROM worker_grades WHERE user_id = $1::uuid`, [job.accepted_by]).catch(() => ({ rows: [] }));
        const grade = (gradeRow.rows?.[0]?.grade || 'C').toUpperCase().charAt(0);
        if (totalJobsAfter >= GRADUATE_JOBS_MIN && grade === 'B') {
          await pool.query(
            `UPDATE coach_trainee_connections SET status = 'graduated', training_end_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [conn.id]
          );
        } else {
          coachFeeAmount = round2(providerReceive * TRAINING_FEE_PERCENT);
          coachId = conn.coach_id;
          connectionId = conn.id;
        }
      } else if (totalJobsAfter >= GRADUATE_JOBS_MIN) {
        const gradeRow = await pool.query(`SELECT grade FROM worker_grades WHERE user_id = $1::uuid`, [job.accepted_by]).catch(() => ({ rows: [] }));
        const grade = (gradeRow.rows?.[0]?.grade || 'C').toUpperCase().charAt(0);
        await pool.query(
          `UPDATE coach_trainee_connections SET status = $1, updated_at = NOW() WHERE id = $2`,
          [grade === 'B' ? 'graduated' : 'disqualified', conn.id]
        );
      } else {
        await pool.query(`UPDATE coach_trainee_connections SET status = 'disqualified', updated_at = NOW() WHERE id = $1`, [conn.id]);
      }
    }
  } catch (e) {
    console.warn('[Stripe] Coach fee check failed:', e.message);
  }

  const talentNet = round2(providerReceive - coachFeeAmount);

  return {
    job,
    jobId: String(jobId),
    jobPd,
    clientUser,
    provider,
    employerCashPosting,
    employerCashHeld,
    effectiveDiscount: effectiveDiscountFinal,
    hasInsurance,
    insuranceAmount,
    insuranceRatePercent,
    policyNumber,
    employerOutflow,
    finalPrice,
    providerInflow,
    handlingFeeAmount,
    commissionFeeAmount,
    taxServiceAmount,
    talentNet,
    feeAmount,
    commissionRate,
    providerReceive,
    coachFeeAmount,
    coachId,
    connectionId,
    vipApplied,
    vipDiscountAmount,
    clientVip,
    maturityVoucherId,
    userId,
    includesMarkup,
    jobFee,
  };
}

export async function createStripePaymentIntentForJob(pool, { jobId, userId, discountAmount = 0, hasInsurance = false, maturityVoucherId = null }) {
  const ctx = await buildMatchJobPaymentContext(pool, jobId, {
    effectiveDiscount: discountAmount,
    hasInsurance,
    maturityVoucherId,
    userId,
  });
  const { job, finalPrice } = ctx;
  const employerId = String(job.created_by);
  const uid = String(userId);
  if (employerId !== uid) {
    const urow = await pool.query(`SELECT id, firebase_uid FROM users WHERE id::text = $1 OR firebase_uid = $1 LIMIT 1`, [uid]);
    const internal = urow.rows?.[0];
    if (!internal || String(internal.id) !== String(job.created_by)) {
      throw new Error('forbidden_not_employer');
    }
  }

  const statusOk = (job.status || '').toLowerCase();
  if (statusOk !== 'waiting_for_payment' && statusOk !== 'waiting_for_approval') {
    throw new Error('invalid_job_status');
  }

  const amountSatang = Math.round(Math.max(0, finalPrice) * 100);
  if (amountSatang < 100) throw new Error('amount_too_small');

  const stripe = getStripe();
  const pi = await stripe.paymentIntents.create({
    amount: amountSatang,
    currency: 'thb',
    automatic_payment_methods: { enabled: true },
    statement_descriptor: getStripeStatementDescriptor(),
    metadata: {
      job_id: String(jobId),
      user_id: employerId,
      discount_amount: String(ctx.effectiveDiscount ?? 0),
      has_insurance: String(!!ctx.hasInsurance),
      maturity_voucher_id: maturityVoucherId ? String(maturityVoucherId) : '',
    },
    description: `AQOND job ${jobId}`,
  });

  return {
    clientSecret: pi.client_secret,
    paymentIntentId: pi.id,
    amountThb: finalPrice,
    amountSatang,
    publishableKey: getStripePublishable(),
  };
}

export async function finalizeMatchJobFromStripePaymentIntent(pool, paymentIntent, stripePaymentIntentId) {
  const jobId = paymentIntent.metadata?.job_id;
  if (!jobId) throw new Error('missing_job_metadata');

  const existing = await pool.query(
    `SELECT id, payment_status, payment_details FROM jobs WHERE id::text = $1 LIMIT 1`,
    [String(jobId)]
  );
  const row = existing.rows?.[0];
  if (!row) throw new Error('job_not_found');
  if (row.payment_status === 'paid') {
    return { ok: true, skipped: true, reason: 'already_paid' };
  }

  const meta = paymentIntent.metadata || {};
  const mv = meta.maturity_voucher_id && String(meta.maturity_voucher_id).trim() ? meta.maturity_voucher_id : null;
  const ctx = await buildMatchJobPaymentContext(pool, jobId, {
    effectiveDiscount: Number(meta.discount_amount || 0),
    hasInsurance: meta.has_insurance === 'true',
    maturityVoucherId: mv,
    userId: meta.user_id || paymentIntent.metadata?.user_id,
  });

  const expectedSatang = Math.round(Math.max(0, ctx.finalPrice) * 100);
  if (paymentIntent.amount !== expectedSatang) {
    console.error('[Stripe webhook] amount mismatch', {
      jobId,
      expected: expectedSatang,
      got: paymentIntent.amount,
    });
    throw new Error('amount_mismatch');
  }

  const amountThb = ctx.finalPrice;
  const paymentMethod = 'stripe';

    const {
    job,
    jobPd,
    clientUser,
    provider,
    employerCashPosting,
    employerCashHeld,
    hasInsurance,
    insuranceAmount,
    insuranceRatePercent,
    policyNumber,
    employerOutflow,
    finalPrice,
    providerInflow,
    handlingFeeAmount,
    commissionFeeAmount,
    taxServiceAmount,
    talentNet,
    feeAmount,
    commissionRate,
    coachFeeAmount,
    coachId,
    connectionId,
    vipApplied,
    vipDiscountAmount,
    clientVip,
    maturityVoucherId,
    userId,
    includesMarkup,
    jobFee,
    providerReceive,
  } = ctx;

  const effectiveDiscount = ctx.effectiveDiscount;

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const paymentDetailsPayload = {
      amount: finalPrice,
      job_fee: jobFee,
      has_insurance: !!hasInsurance,
      insurance_amount: insuranceAmount,
      insurance_rate_percent: insuranceRatePercent,
      policy_number: policyNumber,
      insurance_coverage_status: hasInsurance && insuranceAmount > 0 ? 'active' : 'not_started',
      provider_receive: talentNet,
      fee_amount: feeAmount,
      handling_fee_amount: handlingFeeAmount,
      commission_fee_amount: commissionFeeAmount,
      tax_service_amount: taxServiceAmount,
      sourcing_fee_percent: Math.round(providerInflow.sourcingRate * 100),
      commission_fee_percent: Math.round(providerInflow.commissionRate * 100),
      job_type: 'match_board',
      released_status: 'pending',
      release_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
      provider_release_after: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      vip_discount_applied: vipApplied,
      vip_discount_amount: vipDiscountAmount,
      coach_fee_amount: coachFeeAmount,
      coach_id: coachId || undefined,
      price_includes_payment_markup: includesMarkup || undefined,
      brand_adviser_platform_commission_waived: (await isPlatformCommissionWaivedForUser(pool, job.accepted_by)) || undefined,
      stripe_payment_intent_id: stripePaymentIntentId,
      gateway: 'stripe',
    };

    const mergedPaymentDetails = { ...jobPd, ...paymentDetailsPayload };
    if (employerCashHeld) {
      mergedPaymentDetails.cash_liability_status = 'settled';
      mergedPaymentDetails.cash_settlement_at = new Date().toISOString();
      mergedPaymentDetails.cash_liability_released = round2(Number(jobPd.cash_liability_debit) || 0);
    }

    await dbClient.query(
      `UPDATE jobs SET 
          status = 'completed',
          payment_status = 'paid',
          paid_at = NOW(),
          payment_details = $1,
          has_insurance = $3,
          insurance_amount = $4,
          policy_number = $5,
          insurance_coverage_status = $6,
          updated_at = NOW()
         WHERE id = $2`,
      [
        JSON.stringify(mergedPaymentDetails),
        jobId,
        !!hasInsurance,
        insuranceAmount,
        policyNumber,
        hasInsurance && insuranceAmount > 0 ? 'active' : 'not_started',
      ]
    );

    const existingPd =
      typeof job.payment_details === 'string' ? JSON.parse(job.payment_details || '{}') : job.payment_details || {};
    const escrowHeld = !!existingPd.escrow_held;
    const escrowAmount = round2(Number(existingPd.escrow_amount) || 0);
    const amountToDeduct = escrowHeld ? Math.max(0, finalPrice - escrowAmount) : finalPrice;

    if (!employerCashPosting && paymentMethod === 'wallet' && amountToDeduct > 0) {
      /* wallet path — Stripe skips */
    }

    if (employerCashHeld) {
      const releaseAmt = round2(Number(jobPd.cash_liability_debit));
      await dbClient.query(
        `UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1,
           wallet_balance_withdrawable = COALESCE(wallet_balance_withdrawable, 0) + $1,
           updated_at = NOW()
         WHERE id::text = $2 OR id = $2::uuid OR firebase_uid = $2`,
        [releaseAmt, String(job.accepted_by)]
      );
    }

    const provUpdate = await dbClient.query(
      `UPDATE users SET 
          wallet_pending = COALESCE(wallet_pending, 0) + $1,
          completed_jobs_count = COALESCE(completed_jobs_count, 0) + 1
         WHERE id::text = $2 OR firebase_uid = $2
         RETURNING id`,
      [talentNet, String(job.accepted_by)]
    );
    if (!provUpdate.rows?.length) {
      await dbClient.query('ROLLBACK');
      throw new Error('provider_wallet_update_failed');
    }
    const providerActualId = provUpdate.rows[0].id;

    if (coachFeeAmount > 0 && coachId) {
      await dbClient.query(
        `UPDATE users SET wallet_pending = COALESCE(wallet_pending, 0) + $1, updated_at = NOW() WHERE id = $2::uuid`,
        [coachFeeAmount, coachId]
      );
      await dbClient.query(
        `INSERT INTO referral_training_payouts (connection_id, job_id, trainee_id, coach_id, gross_after_commission, training_fee_percent, training_fee_amount, trainee_net, paid_to_coach_at)
           VALUES ($1, $2, $3, $4, $5, 3, $6, $7, NOW())`,
        [connectionId, jobId, job.accepted_by, coachId, providerReceive, coachFeeAmount, talentNet]
      );
    }

    const clientTxAmount = employerCashPosting ? 0 : -finalPrice;
    await dbClient.query(
      `INSERT INTO transactions (
          user_id, type, amount, description,
          status, related_job_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        job.created_by,
        'payment_out',
        clientTxAmount,
        employerCashPosting ? `Cash settlement (employer): ${job.title}` : `Payment for job: ${job.title}`,
        'completed',
        jobId,
        JSON.stringify({
          paymentMethod,
          stripe_payment_intent_id: stripePaymentIntentId,
          employer_cash_posting: employerCashPosting,
          discountAmount: effectiveDiscount,
          maturityVoucherId: maturityVoucherId || undefined,
          job_fee: jobFee,
          insurance_amount: insuranceAmount,
          total: finalPrice,
        }),
      ]
    );

    await dbClient.query(
      `INSERT INTO transactions (
          user_id, type, amount, description,
          status, related_job_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        providerActualId,
        'income',
        talentNet,
        `Income from job: ${job.title}`,
        'pending_release',
        jobId,
        JSON.stringify({
          commission_rate: commissionRate,
          fee_amount: feeAmount,
          release_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
          vip_discount_applied: vipApplied,
          vip_discount_amount: vipDiscountAmount,
          coach_fee: coachFeeAmount || undefined,
          job_fee: jobFee,
          insurance_amount: insuranceAmount,
        }),
      ]
    );

    if (vipApplied && clientVip.tier !== 'platinum') {
      await dbClient.query(
        `UPDATE users SET vip_quota_balance = GREATEST(0, COALESCE(vip_quota_balance, 0) - 1), updated_at = NOW() WHERE id = $1::uuid AND vip_quota_balance > 0`,
        [job.created_by]
      );
    }

    const ledgerId = (s) => `L-${jobId}-${s}-${Date.now()}`;
    const gate = employerCashPosting
      ? 'cash'
      : paymentMethod === 'wallet'
        ? 'wallet'
        : paymentMethod === 'stripe'
          ? 'stripe'
          : 'bank_transfer';
    const resolvedMarkup = includesMarkup ? round2(finalPrice - jobFee - insuranceAmount) : employerOutflow.paymentMarkup;
    const debitMeta = {
      leg: 'user_debit',
      full_amount: finalPrice,
      job_fee: jobFee,
      insurance: insuranceAmount,
      markup: resolvedMarkup,
      markup_percent: 5,
      employer_expense: finalPrice,
      provider_income: talentNet,
      company_fee: feeAmount,
      employer_cash_posting: employerCashPosting,
      cash_liability_released: employerCashHeld ? round2(Number(jobPd.cash_liability_debit) || 0) : undefined,
      stripe_payment_intent_id: stripePaymentIntentId,
    };
    const taxRefDebit = await generateTaxRefIdForInsert(pool, 'payment_created', debitMeta);
    await dbClient.query(
      `INSERT INTO payment_ledger_audit (id, tax_ref_id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, user_id, metadata)
           VALUES ($1, $2, 'payment_created', $3, $4, $5, $6, 'THB', 'completed', $7, $8, $9, $10)`,
      [ledgerId('debit'), taxRefDebit, jobId, gate, jobId, finalPrice, jobId, `T-${jobId}-${Date.now()}`, job.created_by, JSON.stringify(debitMeta)]
    );
    const providerMeta = {
      leg: 'provider_net',
      job_fee: jobFee,
      gross_earnings: jobFee,
      sourcing: handlingFeeAmount,
      commission: commissionFeeAmount,
      tax_service: taxServiceAmount,
      coach_fee: coachFeeAmount || 0,
      employer_expense: finalPrice,
      provider_income: talentNet,
      company_fee: feeAmount,
    };
    const taxRefProvider = await generateTaxRefIdForInsert(pool, 'escrow_held', providerMeta);
    await dbClient.query(
      `INSERT INTO payment_ledger_audit (id, tax_ref_id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, provider_id, metadata)
           VALUES ($1, $2, 'escrow_held', $3, 'wallet', $4, $5, 'THB', 'completed', $6, $7, $8, $9)`,
      [ledgerId('provider'), taxRefProvider, jobId, jobId, talentNet, jobId, `T-${jobId}-${Date.now()}-p`, providerActualId, JSON.stringify(providerMeta)]
    );
    if (coachFeeAmount > 0 && coachId) {
      const coachMeta = { leg: 'coach_training_fee', trainee_id: job.accepted_by };
      const taxRefCoach = await generateTaxRefIdForInsert(pool, 'escrow_held', coachMeta);
      await dbClient.query(
        `INSERT INTO payment_ledger_audit (id, tax_ref_id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, provider_id, metadata)
             VALUES ($1, $2, 'coach_training_fee', $3, 'wallet', $4, $5, 'THB', 'completed', $6, $7, $8, $9)`,
        [ledgerId('coach'), taxRefCoach, jobId, jobId, coachFeeAmount, jobId, `T-${jobId}-${Date.now()}-c`, coachId, JSON.stringify(coachMeta)]
      );
    }
    const ledgerMeta = buildMatchJobLedgerMetadata(employerOutflow, providerInflow, {
      leg: 'commission',
      sub_category: 'Sourcing',
      vip_discount_applied: vipApplied,
      vip_discount_amount: vipDiscountAmount,
      employer_expense: finalPrice,
      provider_income: talentNet,
      company_fee: feeAmount,
    });
    const taxRefCommission = await generateTaxRefIdForInsert(pool, 'escrow_held', ledgerMeta);
    await dbClient.query(
      `INSERT INTO payment_ledger_audit (id, tax_ref_id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, metadata)
           VALUES ($1, $2, 'escrow_held', $3, 'wallet', $4, $5, 'THB', 'completed', $6, $7, $8)`,
      [ledgerId('commission'), taxRefCommission, jobId, jobId, feeAmount, jobId, `T-${jobId}-${Date.now()}-f`, JSON.stringify(ledgerMeta)]
    );
    if (insuranceAmount > 0) {
      const insMeta = {
        leg: 'insurance_liability',
        sub_category: 'Insurance',
        reserve_60: round2(insuranceAmount * 0.6),
        manageable_40: round2(insuranceAmount * 0.4),
        job_fee: jobFee,
        insurance_amount: insuranceAmount,
      };
      const taxRefIns = await generateTaxRefIdForInsert(pool, 'insurance_liability_credit', insMeta);
      await dbClient.query(
        `INSERT INTO payment_ledger_audit (id, tax_ref_id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, metadata)
             VALUES ($1, $2, 'insurance_liability_credit', $3, 'wallet', $4, $5, 'THB', 'completed', $6, $7, $8)`,
        [ledgerId('insurance'), taxRefIns, jobId, jobId, insuranceAmount, `INS-${jobId}`, `T-${jobId}-${Date.now()}-ins`, JSON.stringify(insMeta)]
      );
      await dbClient.query(
        `INSERT INTO insurance_fund_movements (id, type, amount, job_id, reference_id, note, metadata, created_at)
             VALUES ($1, 'liability_credit', $2, $3, $4, $5, $6, NOW())`,
        [ledgerId('ins-mov'), insuranceAmount, jobId, jobId, `Payment job ${jobId}`, JSON.stringify({ job_fee: jobFee, rate_percent: insuranceRatePercent })]
      );
      await dbClient.query(
        `INSERT INTO platform_revenues (transaction_id, source_type, amount, gross_amount, metadata)
             VALUES ($1, 'insurance_premium', $2, $3, $4)`,
        [ledgerId('insurance'), insuranceAmount, jobFee, JSON.stringify({ job_id: jobId, policy_number: policyNumber, rate_percent: insuranceRatePercent })]
      );
    }
    const vipTierForSiphon = clientVip.eligible ? clientVip.tier || 'silver' : provider.vip_tier || 'none';
    const siphonAmount = calcVipAdminFundSiphon(feeAmount, vipTierForSiphon);
    if (siphonAmount > 0) {
      await dbClient.query(
        `INSERT INTO vip_admin_fund (amount, source_event_type, source_ledger_id, source_job_id, source_metadata, vip_tier, gross_profit, siphon_percent)
             VALUES ($1, 'job_match_payment', $2, $3, $4, $5, $6, 12.5)`,
        [siphonAmount, ledgerId('commission'), jobId, JSON.stringify({ job_id: jobId, leg: 'commission', vip_applied: vipApplied }), vipTierForSiphon, feeAmount]
      );
    }

    if (maturityVoucherId && userId) {
      await dbClient
        .query(
          `UPDATE maturity_rewards_vouchers SET used_at = NOW(), used_for_job_id = $1, remaining_baht = 0
           WHERE id = $2 AND user_id = $3 AND used_at IS NULL`,
          [jobId, maturityVoucherId, String(userId)]
        )
        .catch(() => {});
    }

    await dbClient.query('COMMIT');

    setImmediate(() => onJobCompleted(pool, job.accepted_by, jobId, amountThb, new Date()).catch(() => {}));

    return { ok: true, jobId, amountThb: finalPrice };
  } catch (e) {
    await dbClient.query('ROLLBACK');
    throw e;
  } finally {
    dbClient.release();
  }
}

export async function handleStripeWebhookRequest(req, res, pool) {
  const whSecret = getStripeWebhookSecret();
  if (!whSecret) {
    console.error('[Stripe webhook] STRIPE_WEBHOOK_SECRET missing');
    return res.status(503).send('Webhook not configured');
  }

  const sig = req.headers['stripe-signature'];
  const raw = req.body;
  if (!Buffer.isBuffer(raw)) {
    return res.status(400).send('Invalid body');
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(raw, sig, whSecret);
  } catch (err) {
    console.error('[Stripe webhook] signature:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    try {
      await finalizeMatchJobFromStripePaymentIntent(pool, pi, pi.id);
    } catch (e) {
      console.error('[Stripe webhook] finalize:', e);
      if (e.message === 'amount_mismatch') return res.status(400).send('amount_mismatch');
      return res.status(500).json({ error: e.message });
    }
  }

  return res.json({ received: true });
}
