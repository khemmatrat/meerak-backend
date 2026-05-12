/**
 * AQOND Rescue Net — telecom / eSIM purchase API
 */
import crypto from 'crypto';
import {
  GIGASTORE_MOCK_CATALOG,
  getEsimCatalogPackagesFromInventory,
  gigastoreFulfillOrder,
  isGigastoreLive,
  resolveEsimProductForPurchase,
} from '../lib/gigastoreFulfillment.js';

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'];
  if (xff) return String(xff).split(',')[0].trim();
  const ra = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  return String(ra).replace(/^::ffff:/, '') || '127.0.0.1';
}

const CONVENIENCE_FEE_BAHT = 15;
const MARKUP_RATE = 0.05;

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function priceBreakdown(basePrice) {
  const net = round2(Math.max(0, Number(basePrice) || 0));
  const markupAmount = round2(net * MARKUP_RATE);
  const total = round2(net + markupAmount + CONVENIENCE_FEE_BAHT);
  return {
    basePrice: net,
    markupAmount,
    convenienceFee: CONVENIENCE_FEE_BAHT,
    totalCharged: total,
  };
}

export function registerRescueNetTelecomRoutes(app, { pool, authenticateToken, adminAuthMiddleware }) {
  console.log('[rescue-net] routes registered (uuid-safe SQL)');
  /** Public — packages for QR landing (no auth) */
  app.get('/api/v1/telecom/esim-packages', async (req, res) => {
    try {
      let source = 'mock';
      let catalogRows;
      if (isGigastoreLive()) {
        catalogRows = await getEsimCatalogPackagesFromInventory();
        source = 'gigastore';
      } else {
        catalogRows = GIGASTORE_MOCK_CATALOG.map((p) => ({
          sku: p.sku,
          name: p.name,
          region: p.region,
          validityDays: p.validityDays,
          dataGb: p.dataGb,
          basePrice: p.basePrice,
          notes: p.notes || '',
        }));
      }

      const packages = catalogRows.map((p) => {
        const b = priceBreakdown(p.basePrice);
        return {
          sku: p.sku,
          name: p.name,
          region: p.region,
          validityDays: p.validityDays,
          dataGb: p.dataGb,
          basePrice: b.basePrice,
          markupPercent: MARKUP_RATE * 100,
          markupAmount: b.markupAmount,
          convenienceFee: b.convenienceFee,
          totalCustomerPrice: b.totalCharged,
          notes: typeof p.notes === 'string' ? p.notes : '',
        };
      });
      if (source === 'gigastore' && packages.length === 0) {
        console.warn(
          '[esim-packages] GigaStore live returned 0 packages — verify portal inventory, API credentials, and GIGASTORE_INVENTORY_COUNTRY_SET.'
        );
      }
      res.json({
        ok: true,
        packages,
        source,
        pricingNote: 'total = base × 1.05 + 15 THB convenience fee',
      });
    } catch (e) {
      console.error('esim-packages', e);
      res.status(500).json({ error: e.message || 'failed' });
    }
  });

  /** Authenticated — purchase with wallet */
  app.post('/api/v1/telecom/purchase-esim', authenticateToken, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const sku = (req.body?.sku || '').toString().trim();
    if (!sku) return res.status(400).json({ error: 'sku required' });
    const userCountry = (req.body?.user_country || req.body?.userCountry || '').toString().trim() || undefined;

    const product = await resolveEsimProductForPurchase(sku);
    if (!product) {
      return res.status(400).json({ error: 'Invalid or unsupported product SKU' });
    }

    const { basePrice, markupAmount, convenienceFee, totalCharged } = priceBreakdown(product.basePrice);
    const purchaseId = crypto.randomUUID();
    const ledgerJobId = `EN-${purchaseId}`;

    if (!pool) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ห้ามใช้ `id = $1 OR id::text = $1` — PG จะอนุมาน $1 เป็น uuid แล้ว `id::text = $1` กลายเป็น text = uuid (error 42883)
      const u = await client.query(
        'SELECT id, wallet_balance, email FROM users WHERE id = $1::uuid FOR UPDATE',
        [userId]
      );
      if (!u.rows?.[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }

      const balance = parseFloat(u.rows[0].wallet_balance || 0);
      if (balance < totalCharged) {
        await client.query('ROLLBACK');
        return res.status(402).json({
          error: 'Insufficient wallet balance',
          required: totalCharged,
          balance,
        });
      }

      await client.query(
        `UPDATE users SET wallet_balance = GREATEST(0, COALESCE(wallet_balance, 0) - $1),
           wallet_balance_withdrawable = GREATEST(0, COALESCE(wallet_balance_withdrawable, 0) - LEAST($1, COALESCE(wallet_balance_withdrawable, 0))),
           updated_at = NOW()
         WHERE id = $2::uuid`,
        [totalCharged, userId]
      );

      const ledgerId = `L-EN-${purchaseId}`;
      const billNo = `EN-${purchaseId.slice(0, 8).toUpperCase()}`;
      const txnNo = `T-EN-${Date.now()}`;

      await client.query(
        `INSERT INTO payment_ledger_audit (
          id, event_type, payment_id, gateway, job_id, amount, currency, status,
          bill_no, transaction_no, user_id, metadata
        ) VALUES ($1, 'emergency_net_purchase', $2, 'wallet', $3, $4, 'THB', 'completed',
          $5, $6, $7, $8)`,
        [
          ledgerId,
          purchaseId,
          ledgerJobId,
          totalCharged,
          billNo,
          txnNo,
          userId,
          JSON.stringify({
            sku,
            product_name: product.name,
            product_sku_resolved: product.sku,
            base_price: basePrice,
            markup_amount: markupAmount,
            convenience_fee: convenienceFee,
            platform_margin_baht: round2(markupAmount + convenienceFee),
            net_to_vendor_estimate: round2(totalCharged - (markupAmount + convenienceFee)),
            purchase_id: purchaseId,
            leg: 'rescue_net_esim',
          }),
        ]
      );

      const gs = await gigastoreFulfillOrder({
        sku,
        userId,
        purchaseId,
        clientIp: getClientIp(req),
        customerEmail: u.rows[0].email || undefined,
        userCountry,
      });

      const assetRes = await client.query(
        `INSERT INTO user_digital_assets (
          user_id, product_sku, product_name, gigastore_order_ref,
          activation_qr_payload, base_price, markup_amount, convenience_fee, total_charged, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, created_at`,
        [
          u.rows[0].id,
          product.sku,
          product.name,
          gs.orderRef,
          gs.activationPayload,
          basePrice,
          markupAmount,
          convenienceFee,
          totalCharged,
          JSON.stringify({ gs: gs.raw, activation_qr_data_url: gs.activationQrDataUrl }),
        ]
      );

      await client.query('COMMIT');

      const row = assetRes.rows[0];
      return res.json({
        ok: true,
        purchaseId,
        assetId: row.id,
        totalCharged,
        breakdown: { basePrice, markupAmount, convenienceFee },
        activationQrDataUrl: gs.activationQrDataUrl,
        activationPayload: gs.activationPayload,
        gigastoreOrderRef: gs.orderRef,
        createdAt: row.created_at,
      });
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
      if (e.code === '42P01' || e.message?.includes('user_digital_assets')) {
        return res.status(503).json({
          error: 'Rescue Net tables not migrated — run migration 136_rescue_net_esim.sql',
        });
      }
      if (e.code === '23514' && String(e.message || '').includes('payment_ledger_audit_event_type_check')) {
        return res.status(503).json({
          error:
            'ฐานข้อมูลยังไม่อนุญาต event ซื้อ eSIM — รัน migration 138_ensure_emergency_net_purchase_ledger_event.sql (หรือ 136) แล้ว restart backend',
          code: 'LEDGER_EVENT_TYPE_MISMATCH',
        });
      }
      if (e.code === 'SKU_NOT_MAPPED') {
        return res.status(503).json({ error: e.message, code: 'SKU_NOT_MAPPED' });
      }
      console.error('purchase-esim', e);
      return res.status(500).json({ error: e.message || 'Purchase failed' });
    } finally {
      client.release();
    }
  });

  /** Authenticated — list vault items */
  app.get('/api/v1/telecom/my-vault', authenticateToken, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!pool) return res.json({ ok: true, items: [] });

    try {
      const r = await pool.query(
        `SELECT id, product_sku, product_name, gigastore_order_ref, activation_qr_payload,
                base_price, markup_amount, convenience_fee, total_charged, metadata, created_at
         FROM user_digital_assets
         WHERE user_id = $1::uuid
         ORDER BY created_at DESC
         LIMIT 100`,
        [userId]
      );
      const items = (r.rows || []).map((row) => {
        let meta = row.metadata || {};
        if (typeof meta === 'string') {
          try {
            meta = JSON.parse(meta);
          } catch {
            meta = {};
          }
        }
        return {
          id: row.id,
          sku: row.product_sku,
          name: row.product_name,
          orderRef: row.gigastore_order_ref,
          activationPayload: row.activation_qr_payload,
          activationQrDataUrl: meta.activation_qr_data_url || null,
          basePrice: row.base_price,
          totalCharged: row.total_charged,
          createdAt: row.created_at,
        };
      });
      res.json({ ok: true, items });
    } catch (e) {
      if (e.code === '42P01') {
        return res.json({ ok: true, items: [], warning: 'vault table pending migration' });
      }
      console.error('my-vault', e);
      res.status(500).json({ error: e.message || 'failed' });
    }
  });

  /** Admin — sales summary */
  app.get('/api/admin/telecom/rescue-net-stats', adminAuthMiddleware, async (req, res) => {
    if (!pool) return res.json({ ok: true, summary: null, message: 'No DB' });

    try {
      const sales = await pool.query(
        `SELECT COALESCE(SUM(total_charged), 0)::numeric AS revenue,
                COUNT(*)::int AS orders
         FROM user_digital_assets`
      ).catch(() => ({ rows: [{ revenue: 0, orders: 0 }] }));

      const recent = await pool.query(
        `SELECT id, product_sku, product_name, total_charged, created_at, user_id
         FROM user_digital_assets
         ORDER BY created_at DESC
         LIMIT 25`
      ).catch(() => ({ rows: [] }));

      const bySku = await pool.query(
        `SELECT product_sku, COUNT(*)::int AS cnt, COALESCE(SUM(total_charged), 0)::numeric AS revenue
         FROM user_digital_assets
         GROUP BY product_sku
         ORDER BY revenue DESC`
      ).catch(() => ({ rows: [] }));

      res.json({
        ok: true,
        summary: {
          totalRevenue: parseFloat(sales.rows?.[0]?.revenue || 0),
          totalOrders: sales.rows?.[0]?.orders || 0,
        },
        bySku: bySku.rows || [],
        recentPurchases: recent.rows || [],
      });
    } catch (e) {
      if (e.code === '42P01') {
        return res.json({
          ok: true,
          summary: { totalRevenue: 0, totalOrders: 0 },
          bySku: [],
          recentPurchases: [],
          warning: 'Run migration 136_rescue_net_esim.sql',
        });
      }
      console.error('rescue-net-stats', e);
      res.status(500).json({ error: e.message || 'failed' });
    }
  });
}
