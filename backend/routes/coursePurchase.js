/**
 * Course purchase routes — wallet-first, isolated module (Phase 3).
 */
import {
  buildCoursePurchaseQuote,
  buildPurchaseQuoteBundle,
  evaluateCoursePurchaseGate,
  executeWalletCoursePurchase,
  finalizeCoursePurchaseSideEffects,
  formatPurchaseResponse,
} from '../lib/coursePurchaseService.js';
import {
  hashPurchaseRequest,
  loadIdempotentPurchaseResponse,
  readIdempotencyKey,
  storeIdempotentPurchaseResponse,
} from '../lib/coursePurchaseIdempotency.js';
import { userId } from '../lib/courseMarketplaceShared.js';
import {
  createCoursePurchaseGatewayCharge,
  getCourseGatewayChargeStatus,
  reconcileCourseGatewayChargeIfPaid,
} from '../lib/coursePurchaseGateway.js';

export function registerCoursePurchaseRoutes(app, { pool, authenticateToken, optionalAuth }) {
  if (!pool) return;
  const maybeAuth = optionalAuth || authenticateToken;
  app.set('coursePurchaseRoutesRegistered', true);
  app.set('courseGatewayRoutesRegistered', true);

  app.get('/api/courses/:id/purchase-quote', maybeAuth, async (req, res) => {
    try {
      const uid = userId(req);
      const recipientUserId = String(req.query.recipientUserId || '').trim() || null;
      const courseRes = await pool.query(
        `SELECT * FROM courses WHERE id = $1 AND is_marketplace = TRUE AND status = 'published' LIMIT 1`,
        [req.params.id],
      );
      const course = courseRes.rows?.[0];
      if (!course) return res.status(404).json({ error: 'Course not found' });

      const gate = evaluateCoursePurchaseGate(course, uid, {
        isGift: !!(recipientUserId && uid && recipientUserId !== uid),
      });
      if (!gate.ok) {
        return res.status(gate.httpStatus || 400).json({ error: gate.error, code: gate.code });
      }

      const client = await pool.connect();
      try {
        const couponCode = String(req.query.couponCode || '').trim() || null;
        const voucherId = String(req.query.voucherId || '').trim() || null;
        const promoCode = String(req.query.promoCode || '').trim() || null;
        let bundle;
        if (uid) {
          bundle = await buildPurchaseQuoteBundle(client, course, uid, recipientUserId, {
            couponCode,
            voucherId,
            promoCode,
          });
        } else {
          const base = await buildCoursePurchaseQuote(client, course, null);
          bundle = { ...base, wallet: null, installment: null, conversion: null, conversionMeta: null };
        }
        let enrolled = false;
        const enrollUserId = recipientUserId || uid;
        if (uid && enrollUserId) {
          const enr = await pool.query(
            `SELECT 1 FROM course_enrollments WHERE user_id = $1::uuid AND course_id = $2 LIMIT 1`,
            [enrollUserId, course.id],
          );
          enrolled = !!enr.rows?.[0];
        }
        res.json({
          courseId: course.id,
          title: course.title,
          quote: bundle.quote,
          isCoachDirect: bundle.isCoachDirect,
          wallet: bundle.wallet || null,
          installment: bundle.installment || null,
          conversion: bundle.conversion || null,
          enrolled,
          isFree: Number(bundle.quote?.grossAmount || 0) <= 0,
          guaranteeDays: 7,
          gatewayAvailable: true,
        });
      } finally {
        client.release();
      }
    } catch (e) {
      console.error('GET /api/courses/:id/purchase-quote error:', e);
      res.status(500).json({ error: 'Failed to load purchase quote' });
    }
  });

  app.post('/api/courses/:id/purchase', authenticateToken, async (req, res) => {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });

    const body = req.body || {};
    const recipientUserId = body.recipientUserId ? String(body.recipientUserId).trim() : null;
    const giftMessage = body.giftMessage ? String(body.giftMessage).slice(0, 500) : '';
    const paymentMode = body.paymentMode === 'installment' ? 'installment' : 'wallet';
    const installmentCount = body.installmentCount ? Number(body.installmentCount) : undefined;
    const couponCode = body.couponCode ? String(body.couponCode).trim() : null;
    const voucherId = body.voucherId ? String(body.voucherId).trim() : null;
    const promoCode = body.promoCode ? String(body.promoCode).trim() : null;
    const idempotencyKey = readIdempotencyKey(req);
    const requestHash = hashPurchaseRequest(body);

    const client = await pool.connect();
    try {
      if (idempotencyKey) {
        const cached = await loadIdempotentPurchaseResponse(client, {
          idempotencyKey,
          buyerId: uid,
          courseId: req.params.id,
          requestHash,
        });
        if (cached?.conflict) {
          return res.status(409).json({ error: 'Idempotency-Key ถูกใช้กับคำขอที่ต่างกันแล้ว', code: 'IDEMPOTENCY_CONFLICT' });
        }
        if (cached?.response) {
          return res.json(cached.response);
        }
      }

      await client.query('BEGIN');
      const result = await executeWalletCoursePurchase(client, {
        buyerId: uid,
        courseId: req.params.id,
        recipientUserId,
        giftMessage,
        paymentMode,
        installmentCount,
        couponCode,
        voucherId,
        promoCode,
      });

      if (!result.ok) {
        await client.query('ROLLBACK');
        const status = result.httpStatus || 500;
        return res.status(status).json({
          error: result.error,
          code: result.code,
          balance: result.balance,
          required: result.required,
          quote: result.quote,
          installment: result.installment,
        });
      }

      if (result.alreadyEnrolled) {
        await client.query('ROLLBACK');
        const response = formatPurchaseResponse(result);
        if (idempotencyKey) {
          await storeIdempotentPurchaseResponse(client, {
            idempotencyKey,
            buyerId: uid,
            courseId: req.params.id,
            requestHash,
            response,
          });
        }
        return res.json(response);
      }

      await client.query('COMMIT');

      let recipientName = null;
      if (result.isGift && result.enrollUserId) {
        const r = await pool.query(`SELECT full_name FROM users WHERE id = $1::uuid`, [result.enrollUserId]);
        recipientName = r.rows?.[0]?.full_name || null;
      }

      const courseRow = await pool.query(`SELECT id, title FROM courses WHERE id = $1 LIMIT 1`, [req.params.id]);

      await finalizeCoursePurchaseSideEffects(pool, {
        buyerId: uid,
        courseId: req.params.id,
        orderId: result.order.id,
        ledgerId: result.ledgerId,
        quote: result.quote,
        order: result.order,
        course: courseRow.rows?.[0],
        isGift: result.isGift,
        recipientName,
        socialProof: result.socialProof,
      });

      const response = formatPurchaseResponse(result);
      if (idempotencyKey) {
        await storeIdempotentPurchaseResponse(client, {
          idempotencyKey,
          buyerId: uid,
          courseId: req.params.id,
          requestHash,
          response,
        });
      }

      res.json(response);
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      console.error('POST /api/courses/:id/purchase error:', e);
      res.status(500).json({ error: 'Course purchase failed' });
    } finally {
      client.release();
    }
  });

  app.post('/api/courses/:id/purchase/gateway', authenticateToken, async (req, res) => {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });

    const body = req.body || {};
    try {
      const result = await createCoursePurchaseGatewayCharge(pool, {
        buyerId: uid,
        courseId: req.params.id,
        paymentMethod: body.paymentMethod || body.payment_method || 'promptpay',
        returnUrl: body.returnUrl || body.return_uri,
        recipientUserId: body.recipientUserId ? String(body.recipientUserId).trim() : null,
        giftMessage: body.giftMessage ? String(body.giftMessage).slice(0, 500) : '',
        couponCode: body.couponCode ? String(body.couponCode).trim() : null,
        voucherId: body.voucherId ? String(body.voucherId).trim() : null,
        promoCode: body.promoCode ? String(body.promoCode).trim() : null,
      });

      if (!result.ok) {
        return res.status(result.httpStatus || 500).json({
          error: result.error,
          code: result.code,
        });
      }

      return res.status(201).json(result);
    } catch (e) {
      console.error('POST /api/courses/:id/purchase/gateway error:', e);
      return res.status(500).json({ error: 'Failed to create course gateway charge' });
    }
  });

  app.get('/api/courses/purchase/gateway/status/:chargeId', authenticateToken, async (req, res) => {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });

    try {
      const status = await getCourseGatewayChargeStatus(pool, {
        chargeId: String(req.params.chargeId || '').trim(),
        userId: uid,
      });
      if (!status) return res.status(404).json({ error: 'ไม่พบรายการชำระคอร์สนี้' });
      return res.json(status);
    } catch (e) {
      console.error('GET course gateway status error:', e);
      return res.status(500).json({ error: 'Failed to load gateway status' });
    }
  });

  app.post('/api/courses/purchase/gateway/reconcile/:chargeId', authenticateToken, async (req, res) => {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
    try {
      const rec = await reconcileCourseGatewayChargeIfPaid(pool, {
        chargeId: String(req.params.chargeId || '').trim(),
        userId: uid,
        trigger: 'manual',
      });
      return res.json(rec);
    } catch (e) {
      console.error('POST course gateway reconcile error:', e);
      return res.status(500).json({ error: 'Reconcile failed' });
    }
  });
}
