/**
 * Phase 9 — buyer conversion layer (pricing psychology, coupons, bundles, social proof).
 * UI/policy only — purchase still flows through coursePurchaseService + wallet ledger.
 */
import { getEffectivePromoWindow } from './homeBanners.js';
import {
  applyCourseConversionAdjustments,
  normalizeCourseConversionPolicy,
} from './courseFeeEngine.js';
import { computePromoDiscountThb } from './promoVoucherService.js';
import { debitDiscountPromoFundWithClient } from './discountPromoFund.js';

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

export function anonymizeBuyerName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'ผู้เรียน';
  if (parts.length === 1) return `${parts[0].charAt(0)}***`;
  return `${parts[0]} ${parts[1].charAt(0)}.`;
}

export function computeLimitedSeatsOffer(totalEnrolled, base = 50) {
  const enrolled = Math.max(0, Number(totalEnrolled || 0));
  const cap = Math.max(10, Number(base || 50));
  const remaining = Math.max(3, cap - (enrolled % Math.max(1, cap - 3)));
  return {
    seatsRemaining: remaining,
    urgencyLabel: `เหลือ ${remaining} ที่นั่งราคานี้`,
  };
}

export async function loadCoursePromoBanner(pool, courseId) {
  try {
    const r = await pool.query(
      `SELECT b.id, b.title, b.promo_code, b.discount_description,
              b.promo_valid_from, b.promo_valid_until, b.start_date, b.end_date,
              b.is_active, b.promo_claims_enabled
       FROM home_banners b
       WHERE b.is_active = TRUE
         AND (b.action_url ILIKE $1 OR b.action_url ILIKE $2)
       ORDER BY b.sort_order ASC, b.updated_at DESC
       LIMIT 1`,
      [`%/courses/${courseId}%`, `%/courses/${courseId}`],
    );
    const row = r.rows?.[0];
    if (!row) return null;
    const { until } = getEffectivePromoWindow(row);
    if (!until || until.getTime() <= Date.now()) return null;
    return {
      bannerId: row.id,
      title: row.title,
      promoCode: row.promo_code || null,
      description: row.discount_description || null,
      endsAt: until.toISOString(),
      countdownSeconds: Math.max(0, Math.floor((until.getTime() - Date.now()) / 1000)),
    };
  } catch {
    return null;
  }
}

export async function loadRecentCourseBuyers(pool, courseId, limit = 5) {
  try {
    const r = await pool.query(
      `SELECT u.full_name, o.created_at
       FROM course_purchase_orders o
       JOIN users u ON u.id = o.user_id
       WHERE o.course_id = $1
         AND o.status = 'completed'
         AND COALESCE(o.metadata->>'is_gift', 'false') <> 'true'
       ORDER BY o.created_at DESC
       LIMIT $2`,
      [courseId, Math.min(Math.max(1, limit), 10)],
    );
    return (r.rows || []).map((row) => ({
      displayName: anonymizeBuyerName(row.full_name),
      purchasedAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    }));
  } catch {
    return [];
  }
}

export async function hasCompletedCoursePurchase(client, userId, excludeCourseId = null) {
  if (!userId) return false;
  try {
    const r = await client.query(
      `SELECT 1 FROM course_purchase_orders
       WHERE user_id = $1::uuid
         AND status = 'completed'
         AND ($2::text IS NULL OR course_id <> $2::text)
       LIMIT 1`,
      [userId, excludeCourseId || null],
    );
    return !!r.rows?.[0];
  } catch {
    return false;
  }
}

export async function resolveInstructorCoupon(client, { code, courseId, instructorId, userId }) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return { ok: false, error: 'missing_code' };
  try {
    const r = await client.query(
      `SELECT * FROM course_instructor_coupons
       WHERE UPPER(code) = $1
         AND instructor_user_id = $2::uuid
         AND is_active = TRUE
         AND (course_id IS NULL OR course_id = $3)
       FOR UPDATE`,
      [normalized, instructorId, courseId],
    );
    const row = r.rows?.[0];
    if (!row) return { ok: false, error: 'invalid_coupon' };
    const now = Date.now();
    if (row.valid_from && new Date(row.valid_from).getTime() > now) {
      return { ok: false, error: 'coupon_not_started' };
    }
    if (row.valid_until && new Date(row.valid_until).getTime() < now) {
      return { ok: false, error: 'coupon_expired' };
    }
    if (Number(row.use_count || 0) >= Number(row.max_uses || 0)) {
      return { ok: false, error: 'coupon_exhausted' };
    }
    if (userId) {
      const used = await client.query(
        `SELECT 1 FROM course_coupon_redemptions
         WHERE coupon_id = $1::uuid AND user_id = $2::uuid AND course_id = $3
         LIMIT 1`,
        [row.id, userId, courseId],
      );
      if (used.rows?.[0]) return { ok: false, error: 'coupon_already_used' };
    }
    return {
      ok: true,
      coupon: {
        id: row.id,
        code: row.code,
        discountPercent: round2(Math.min(80, Math.max(0, Number(row.discount_percent || 0)))),
      },
    };
  } catch {
    return { ok: false, error: 'coupon_lookup_failed' };
  }
}

export async function resolveCoursePromoVoucher(client, {
  voucherId,
  promoCode,
  userId,
  courseId,
  grossBeforeVoucher,
}) {
  if (!userId) return { ok: false, error: 'login_required' };
  try {
    let r;
    if (voucherId) {
      r = await client.query(
        `SELECT v.*, b.promo_claims_enabled AS banner_promo_claims_enabled,
                b.action_url AS banner_action_url
         FROM user_promo_vouchers v
         JOIN home_banners b ON b.id = v.banner_id
         WHERE v.id = $1 AND v.user_id = $2::uuid
         FOR UPDATE`,
        [voucherId, userId],
      );
    } else if (promoCode) {
      r = await client.query(
        `SELECT v.*, b.promo_claims_enabled AS banner_promo_claims_enabled,
                b.action_url AS banner_action_url
         FROM user_promo_vouchers v
         JOIN home_banners b ON b.id = v.banner_id
         WHERE UPPER(v.promo_code) = UPPER($1) AND v.user_id = $2::uuid
         FOR UPDATE`,
        [promoCode, userId],
      );
    } else {
      return { ok: false, error: 'missing_voucher' };
    }
    const row = r.rows?.[0];
    if (!row) return { ok: false, error: 'voucher_not_found' };
    if (row.banner_promo_claims_enabled === false) {
      return { ok: false, error: 'promo_claims_paused' };
    }
    const actionUrl = String(row.banner_action_url || '');
    if (actionUrl && !actionUrl.includes(`/courses/${courseId}`)) {
      return { ok: false, error: 'voucher_not_for_course' };
    }
    const now = new Date();
    if (row.expires_at && new Date(row.expires_at) < now) {
      return { ok: false, error: 'voucher_expired' };
    }
    const discountThb = round2(computePromoDiscountThb(row, grossBeforeVoucher));
    if (discountThb <= 0) return { ok: false, error: 'voucher_no_discount' };
    return {
      ok: true,
      voucher: {
        id: row.id,
        promoCode: row.promo_code,
        discountThb,
        remainingBaht: round2(Number(row.remaining_baht || 0)),
      },
    };
  } catch {
    return { ok: false, error: 'voucher_lookup_failed' };
  }
}

export async function loadCourseBundlesForCourse(pool, courseId) {
  try {
    const r = await pool.query(
      `SELECT b.*,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'courseId', c.id,
                  'title', c.title,
                  'priceThb', c.price_thb
                ) ORDER BY bi.sort_order)
                 FROM course_bundle_items bi
                 JOIN courses c ON c.id = bi.course_id
                 WHERE bi.bundle_id = b.id),
                '[]'::json
              ) AS courses
       FROM course_bundles b
       JOIN course_bundle_items bi ON bi.bundle_id = b.id
       WHERE bi.course_id = $1
         AND b.is_active = TRUE
         AND (b.valid_until IS NULL OR b.valid_until > NOW())`,
      [courseId],
    );
    return (r.rows || []).map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      subtitle: row.subtitle || null,
      bundlePriceThb: round2(Number(row.bundle_price_thb || 0)),
      originalPriceThb: round2(Number(row.original_price_thb || 0)),
      courses: Array.isArray(row.courses) ? row.courses : [],
      savingsThb: round2(
        Math.max(0, Number(row.original_price_thb || 0) - Number(row.bundle_price_thb || 0)),
      ),
    }));
  } catch {
    return [];
  }
}

export async function loadActiveCourseBundles(pool, limit = 8) {
  try {
    const r = await pool.query(
      `SELECT b.*,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'courseId', c.id,
                  'title', c.title,
                  'priceThb', c.price_thb
                ) ORDER BY bi.sort_order)
                 FROM course_bundle_items bi
                 JOIN courses c ON c.id = bi.course_id
                 WHERE bi.bundle_id = b.id),
                '[]'::json
              ) AS courses
       FROM course_bundles b
       WHERE b.is_active = TRUE
         AND (b.valid_until IS NULL OR b.valid_until > NOW())
       ORDER BY b.created_at DESC
       LIMIT $1`,
      [Math.min(Math.max(1, limit), 20)],
    );
    return (r.rows || []).map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      subtitle: row.subtitle || null,
      bundlePriceThb: round2(Number(row.bundle_price_thb || 0)),
      originalPriceThb: round2(Number(row.original_price_thb || 0)),
      courses: Array.isArray(row.courses) ? row.courses : [],
      savingsThb: round2(
        Math.max(0, Number(row.original_price_thb || 0) - Number(row.bundle_price_thb || 0)),
      ),
    }));
  } catch {
    return [];
  }
}

export async function buildCourseConversionMeta(pool, client, {
  course,
  userId,
  policy,
  couponCode,
  voucherId,
  promoCode,
  recipientUserId,
}) {
  const conversionPolicy = normalizeCourseConversionPolicy(policy);
  const subjectUserId = recipientUserId || userId;
  const [promo, recentBuyers, bundles, hadPriorPurchase] = await Promise.all([
    loadCoursePromoBanner(pool, course.id),
    loadRecentCourseBuyers(pool, course.id, 5),
    loadCourseBundlesForCourse(pool, course.id),
    subjectUserId ? hasCompletedCoursePurchase(client || pool, subjectUserId, course.id) : Promise.resolve(true),
  ]);
  const limitedSeats = computeLimitedSeatsOffer(course.total_enrolled, conversionPolicy.limitedSeatsBase);
  const firstPurchaseEligible = !!subjectUserId && !hadPriorPurchase;

  let coupon = null;
  if (couponCode && course.instructor_user_id) {
    const resolved = await resolveInstructorCoupon(client || pool, {
      code: couponCode,
      courseId: course.id,
      instructorId: course.instructor_user_id,
      userId: subjectUserId,
    });
    if (resolved.ok) coupon = resolved.coupon;
  }

  return {
    promo,
    limitedSeats,
    recentBuyers,
    bundles,
    firstPurchaseEligible,
    firstPurchaseDiscountRate: firstPurchaseEligible ? conversionPolicy.firstPurchaseDiscountRate : 0,
    firstPurchaseBonusPoints: firstPurchaseEligible ? conversionPolicy.firstPurchaseBonusPoints : 0,
    coupon,
    voucherId: voucherId || null,
    promoCode: promoCode || null,
    conversionPolicy,
  };
}

export async function applyConversionToQuote(client, {
  baseQuote,
  policy,
  conversionMeta,
  voucherId,
  promoCode,
  userId,
  courseId,
}) {
  let voucherDiscountThb = 0;
  let voucher = null;
  const grossBeforeVoucher = Number(baseQuote.grossAmount || 0);

  if ((voucherId || promoCode) && userId) {
    const resolved = await resolveCoursePromoVoucher(client, {
      voucherId,
      promoCode,
      userId,
      courseId,
      grossBeforeVoucher,
    });
    if (resolved.ok) {
      voucher = resolved.voucher;
      voucherDiscountThb = resolved.voucher.discountThb;
    }
  }

  const couponDiscountRate = conversionMeta?.coupon
    ? Number(conversionMeta.coupon.discountPercent || 0) / 100
    : 0;
  const firstPurchaseDiscountRate = Number(conversionMeta?.firstPurchaseDiscountRate || 0);

  const quote = applyCourseConversionAdjustments(baseQuote, {
    couponDiscountRate,
    firstPurchaseDiscountRate,
    voucherDiscountThb,
    platformRate: baseQuote.platformRate,
  });

  const conversion = {
    coupon: conversionMeta?.coupon || null,
    voucher,
    firstPurchaseApplied: firstPurchaseDiscountRate > 0,
    firstPurchaseBonusPoints: conversionMeta?.firstPurchaseBonusPoints || 0,
    limitedSeats: conversionMeta?.limitedSeats || null,
    promo: conversionMeta?.promo || null,
    discountBreakdown: {
      couponDiscountRate,
      firstPurchaseDiscountRate,
      voucherDiscountThb,
      totalSavings: round2(Math.max(0, grossBeforeVoucher - Number(quote.grossAmount || 0))),
    },
  };

  return { quote, conversion };
}

export async function redeemConversionOnPurchase(client, {
  userId,
  courseId,
  orderId,
  conversion,
  grossCharged,
}) {
  const redeemed = { coupon: false, voucher: false, bonusPoints: 0 };

  if (conversion?.coupon?.id) {
    await client.query(
      `UPDATE course_instructor_coupons
       SET use_count = COALESCE(use_count, 0) + 1
       WHERE id = $1::uuid`,
      [conversion.coupon.id],
    );
    await client.query(
      `INSERT INTO course_coupon_redemptions (coupon_id, user_id, course_id, order_id, discount_amount)
       VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5)
       ON CONFLICT (coupon_id, user_id, course_id) DO NOTHING`,
      [
        conversion.coupon.id,
        userId,
        courseId,
        orderId,
        Number(conversion.discountBreakdown?.totalSavings || 0),
      ],
    );
    redeemed.coupon = true;
  }

  if (conversion?.voucher?.id) {
    const useAmount = round2(Number(conversion.voucher.discountThb || 0));
    const vRes = await client.query(
      `SELECT * FROM user_promo_vouchers WHERE id = $1 FOR UPDATE`,
      [conversion.voucher.id],
    );
    const v = vRes.rows?.[0];
    if (v) {
      const rem = round2(Number(v.remaining_baht || 0));
      const applied = round2(Math.min(rem, useAmount));
      if (applied > 0) {
        await debitDiscountPromoFundWithClient(client, {
          amountThb: applied,
          note: `course_purchase:${courseId}`,
          kind: 'course_voucher',
          ref: { voucher_id: v.id, course_id: courseId, order_id: orderId },
        });
        await client.query(
          `UPDATE user_promo_vouchers
           SET remaining_baht = GREATEST(0, COALESCE(remaining_baht, 0) - $1)
           WHERE id = $2`,
          [applied, v.id],
        );
        await client.query(
          `INSERT INTO course_promo_voucher_uses (voucher_id, user_id, course_id, order_id, discount_amount)
           VALUES ($1, $2::uuid, $3, $4::uuid, $5)`,
          [v.id, userId, courseId, orderId, applied],
        );
        redeemed.voucher = true;
      }
    }
  }

  if (conversion?.firstPurchaseApplied && conversion?.firstPurchaseBonusPoints > 0) {
    redeemed.bonusPoints = Number(conversion.firstPurchaseBonusPoints || 0);
  }

  return redeemed;
}

export async function loadCourseDetailConversion(pool, courseRow, userId) {
  const client = pool;
  const policyRow = await pool.query(
    `SELECT value_json FROM payout_config WHERE key = 'course_revenue_policy' LIMIT 1`,
  );
  const policy = policyRow.rows?.[0]?.value_json || {};
  const meta = await buildCourseConversionMeta(pool, client, {
    course: courseRow,
    userId,
    policy,
  });
  return {
    promo: meta.promo,
    limitedSeats: meta.limitedSeats,
    recentBuyers: meta.recentBuyers,
    bundles: meta.bundles,
    firstPurchaseEligible: meta.firstPurchaseEligible,
    firstPurchaseDiscountRate: meta.firstPurchaseDiscountRate,
    firstPurchaseBonusPoints: meta.firstPurchaseBonusPoints,
  };
}
