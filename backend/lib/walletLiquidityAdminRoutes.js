/**
 * Admin: Wallet Liquidity dashboard — read-only aggregates + discount promo fund (system_settings JSON).
 * ไม่แก้ ledger / เครดิตผู้ใช้ยกเว้น POST …/discount-fund/credit (เขียน system_settings เท่านั้น).
 */
import crypto from 'node:crypto';

const DISCOUNT_PROMO_FUND_KEY = 'discount_promo_fund';
const BANK_TZ = 'Asia/Bangkok';

const FINANCE_CREDIT_DISCOUNT_ROLES = new Set(['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT']);

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function todayBangkokDateString() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BANK_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function isoDateBangkok(dateVal) {
  if (!dateVal) return '';
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: BANK_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return s.replace(/\//g, '-').length >= 10 ? s.slice(0, 10) : d.toISOString().slice(0, 10);
}

async function readDiscountPromoFund(pool) {
  const r = await pool
    .query(`SELECT value, updated_at FROM system_settings WHERE key = $1 LIMIT 1`, [DISCOUNT_PROMO_FUND_KEY])
    .catch(() => ({ rows: [] }));
  const raw = r.rows?.[0]?.value;
  let parsed = { balance_thb: 0, movements: [] };
  if (raw != null && String(raw).trim()) {
    try {
      const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (j && typeof j === 'object') {
        parsed = {
          balance_thb: num(j.balance_thb, 0),
          movements: Array.isArray(j.movements) ? j.movements : [],
          updated_at: j.updated_at || null,
          help_th: typeof j.help_th === 'string' ? j.help_th : undefined,
        };
      }
    } catch (_) {
      /* ignore */
    }
  }
  if (!parsed.help_th) {
    parsed.help_th =
      'ยอดนี้เป็นบันทึกงบประมาณโค้ดส่วนลดเท่านั้น — ไม่ได้ตัดเครดิตจาก wallet ผู้ใช้อัตโนมัติ';
  }
  parsed.updated_at = r.rows?.[0]?.updated_at || parsed.updated_at || null;
  return parsed;
}

/**
 * @param {import('express').Express} app
 * @param {import('pg').Pool} pool
 * @param {(req:any,res:any,next:any)=>void} adminAuthMiddleware
 * @param {{ log?: (...a:any[])=>void } | null} auditService optional
 */
export function registerWalletLiquidityAdminRoutes(app, pool, adminAuthMiddleware, auditService = null) {
  /** @type {(e:unknown,...args:any)=>void} */
  const slog = (...args) => {
    try {
      console.error('[wallet-liquidity-admin]', ...args);
    } catch (_) {
      /* ignore */
    }
  };

  const handleDiscountGet = async (req, res) => {
    try {
      const d = await readDiscountPromoFund(pool);
      res.json({
        balance_thb: d.balance_thb,
        movements: d.movements.slice(-500),
        updated_at: d.updated_at ? new Date(d.updated_at).toISOString() : null,
        help_th: d.help_th,
      });
    } catch (e) {
      slog('GET discount-fund', e?.message || e);
      res.status(500).json({ error: 'โหลดข้อมูลกองทุนไม่สำเร็จ' });
    }
  };

  app.get('/api/admin/financial/discount-fund', adminAuthMiddleware, handleDiscountGet);
  app.get('/api/admin/wallet/discount-fund', adminAuthMiddleware, handleDiscountGet);

  app.post('/api/admin/financial/discount-fund/credit', adminAuthMiddleware, async (req, res) => {
    try {
      const role = req.adminUser?.role;
      if (!FINANCE_CREDIT_DISCOUNT_ROLES.has(role)) {
        return res.status(403).json({ error: 'ต้องเป็น ADMIN / SUPER_ADMIN / ACCOUNTANT' });
      }
      const amountThb = num(req.body?.amount_thb ?? req.body?.amount, NaN);
      const note = String(req.body?.note ?? '').trim().slice(0, 500);
      if (!Number.isFinite(amountThb) || amountThb <= 0) {
        return res.status(400).json({ error: 'amount_thb ต้องเป็นตัวเลขบวก' });
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const cur = await client.query(
          `SELECT value FROM system_settings WHERE key = $1 FOR UPDATE`,
          [DISCOUNT_PROMO_FUND_KEY],
        );
        const prevRaw = cur.rows?.[0]?.value;
        let doc = { balance_thb: 0, movements: [] };
        if (prevRaw != null && String(prevRaw).trim()) {
          try {
            const j = typeof prevRaw === 'string' ? JSON.parse(prevRaw) : prevRaw;
            if (j && typeof j === 'object') {
              doc = {
                balance_thb: num(j.balance_thb, 0),
                movements: Array.isArray(j.movements) ? j.movements : [],
              };
            }
          } catch (_) {
            /* reset shape */
          }
        }
        const movement = {
          at: new Date().toISOString(),
          amount_thb: Math.round(amountThb * 100) / 100,
          note: note || 'credit',
          admin_id: req.adminUser?.id ? String(req.adminUser.id) : null,
          kind: 'credit',
        };
        doc.balance_thb = Math.round((num(doc.balance_thb, 0) + movement.amount_thb) * 100) / 100;
        doc.movements = [...doc.movements, movement].slice(-500);
        doc.updated_at = movement.at;
        doc.help_th =
          'ยอดนี้เป็นบันทึกงบประมาณโค้ดส่วนลดเท่านั้น — ไม่ได้ตัดเครดิตจาก wallet ผู้ใช้อัตโนมัติ';
        const jsonOut = JSON.stringify(doc);
        await client.query(
          `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [DISCOUNT_PROMO_FUND_KEY, jsonOut],
        );
        await client.query('COMMIT');
        if (auditService?.log) {
          auditService.log(String(req.adminUser.id), 'discount_promo_fund_credit', {
            entityName: 'system_settings',
            entityId: DISCOUNT_PROMO_FUND_KEY,
          }, { amount_thb: movement.amount_thb, note: movement.note, actorRole: role, ipAddress: req.ip });
        }
        res.json({
          balance_thb: doc.balance_thb,
          movement,
          movements: doc.movements,
        });
      } catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      if (e?.code === '42P01') {
        return res.status(503).json({ error: 'ตาราง system_settings ยังไม่พร้อม' });
      }
      slog('POST discount-fund/credit', e?.message || e);
      res.status(500).json({ error: 'บันทึกกองทุนไม่สำเร็จ' });
    }
  });

  app.get('/api/admin/wallet/liquidity-summary', adminAuthMiddleware, async (req, res) => {
    try {
      const [
        userCreditR,
        pendingPayoutR,
        adminDebitR,
        adminCreditR,
        approvedPayoutLedgerR,
        manualGrossR,
        feeWithdrawR,
        feeDepositR,
      ] = await Promise.all([
        pool
          .query(`SELECT COALESCE(SUM(COALESCE(wallet_balance, 0)), 0)::numeric AS t FROM users`)
          .catch(() => ({ rows: [{ t: 0 }] })),
        pool
          .query(`SELECT COALESCE(SUM(COALESCE(amount, 0)), 0)::numeric AS t FROM payout_requests WHERE status = 'pending'`)
          .catch(() => ({ rows: [{ t: 0 }] })),
        pool
          .query(`SELECT COALESCE(SUM(COALESCE(amount, 0)), 0)::numeric AS t FROM payment_ledger_audit WHERE event_type = 'admin_debit' AND LOWER(COALESCE(status, 'completed')) = 'completed'`)
          .catch(() => ({ rows: [{ t: 0 }] })),
        pool
          .query(`SELECT COALESCE(SUM(COALESCE(amount, 0)), 0)::numeric AS t FROM payment_ledger_audit WHERE event_type = 'admin_credit' AND LOWER(COALESCE(status, 'completed')) = 'completed'`)
          .catch(() => ({ rows: [{ t: 0 }] })),
        pool
          .query(`SELECT COALESCE(SUM(COALESCE(amount, 0)), 0)::numeric AS t FROM payment_ledger_audit WHERE event_type = 'user_payout_withdrawal' AND LOWER(COALESCE(status, 'completed')) IN ('completed', 'success', 'paid')`)
          .catch(() => ({
            rows: [{ t: 0 }],
          })),
        pool
          .query(
            `SELECT COALESCE(SUM(COALESCE(amount, 0)), 0)::numeric AS t FROM payment_ledger_audit
             WHERE event_type = 'wallet_deposit'
               AND (
                 gateway = 'bank_transfer'
                 OR LOWER(TRIM(COALESCE(metadata->>'source_type',''))) = 'manual'
               )
               AND LOWER(COALESCE(status, 'completed')) IN ('completed', 'success')`,
          )
          .catch(() => ({ rows: [{ t: 0 }] })),
        pool
          .query(`SELECT COALESCE(SUM(COALESCE(amount, 0)), 0)::numeric AS t FROM platform_revenues WHERE source_type = 'withdrawal_fee_margin'`)
          .catch(() => ({ rows: [{ t: 0 }] })),
        pool
          .query(
            `SELECT COALESCE(SUM(COALESCE(amount, 0)), 0)::numeric AS t FROM platform_revenues WHERE source_type LIKE 'deposit_margin_%'`,
          )
          .catch(() => ({ rows: [{ t: 0 }] })),
      ]);

      let manualWtSum = null;
      let paysoPendingWt = null;
      let paysoReceivedWt = null;
      try {
        const [mw, pp, pr] = await Promise.all([
          pool.query(
            `SELECT COALESCE(SUM(COALESCE(net_amount_thb, 0)), 0)::numeric AS t FROM wallet_transactions
             WHERE funding_source = 'MANUAL' AND settlement_status = 'RECEIVED'`,
          ),
          pool.query(
            `SELECT COALESCE(SUM(COALESCE(net_amount_thb, 0)), 0)::numeric AS t FROM wallet_transactions
             WHERE funding_source = 'PAYSO' AND settlement_status = 'PENDING_SETTLEMENT'`,
          ),
          pool.query(
            `SELECT COALESCE(SUM(COALESCE(net_amount_thb, 0)), 0)::numeric AS t FROM wallet_transactions
             WHERE funding_source = 'PAYSO' AND settlement_status = 'RECEIVED'`,
          ),
        ]);
        manualWtSum = mw;
        paysoPendingWt = pp;
        paysoReceivedWt = pr;
      } catch (_) {
        manualWtSum = null;
        paysoPendingWt = null;
        paysoReceivedWt = null;
      }

      const [
        paysoPendingMetaR,
        paysoReceivedMetaR,
        manualMetaR,
      ] = await Promise.all([
        pool
          .query(
            `SELECT COALESCE(SUM(COALESCE(net_amount, amount, 0)), 0)::numeric AS t FROM payment_ledger_audit
             WHERE event_type = 'wallet_deposit'
               AND COALESCE(metadata->>'settlement_status','') = 'PENDING_SETTLEMENT'
               AND LOWER(COALESCE(status, '')) NOT IN ('failed', 'reversed')`,
          )
          .catch(() => ({ rows: [{ t: 0 }] })),
        pool
          .query(
            `SELECT COALESCE(SUM(COALESCE(net_amount, amount, 0)), 0)::numeric AS t FROM payment_ledger_audit
             WHERE event_type = 'wallet_deposit'
               AND COALESCE(metadata->>'settlement_status','') = 'RECEIVED'
               AND (COALESCE(metadata->>'funding_source','') IN ('PAYSO','')
                 OR gateway IN ('payso','promptpay'))
               AND LOWER(COALESCE(metadata->>'source_type','payso')) NOT IN ('manual', 'bank_transfer')`,
          )
          .catch(() => ({ rows: [{ t: 0 }] })),
        pool
          .query(
            `SELECT COALESCE(SUM(COALESCE(net_amount, amount, 0)), 0)::numeric AS t FROM payment_ledger_audit
             WHERE event_type = 'wallet_deposit'
               AND COALESCE(metadata->>'settlement_status','') = 'RECEIVED'
               AND LOWER(TRIM(COALESCE(metadata->>'source_type',''))) IN ('manual', 'bank_transfer')`,
          )
          .catch(() => ({ rows: [{ t: 0 }] })),
      ]);

      const total_user_credit_thb = num(userCreditR.rows?.[0]?.t, 0);
      const pending_payouts_total_thb = num(pendingPayoutR.rows?.[0]?.t, 0);
      const admin_debit_total_thb = num(adminDebitR.rows?.[0]?.t, 0);
      const admin_credit_total_thb = num(adminCreditR.rows?.[0]?.t, 0);
      const total_approved_payouts_thb = num(approvedPayoutLedgerR.rows?.[0]?.t, 0);

      let manual_verified_net_thb = manualWtSum ? num(manualWtSum.rows?.[0]?.t, NaN) : NaN;
      if (!Number.isFinite(manual_verified_net_thb)) manual_verified_net_thb = num(manualMetaR.rows?.[0]?.t, 0);

      let payso_pending_net = paysoPendingWt ? num(paysoPendingWt.rows?.[0]?.t, NaN) : NaN;
      if (!Number.isFinite(payso_pending_net)) payso_pending_net = num(paysoPendingMetaR.rows?.[0]?.t, 0);

      let payso_received_net = paysoReceivedWt ? num(paysoReceivedWt.rows?.[0]?.t, NaN) : NaN;
      if (!Number.isFinite(payso_received_net)) payso_received_net = num(paysoReceivedMetaR.rows?.[0]?.t, 0);

      const manual_gross_approx = num(manualGrossR.rows?.[0]?.t, 0);

      /** ถ้า hybrid มีแถวแต่ยังไม่ sync metadata เต็ม — อย่างน้อยใช้ net จาก WT เป็น manual เมื่อ ledger manual ว่าง */
      if (manual_verified_net_thb <= 0 && manualWtSum) {
        const wtn = num(manualWtSum.rows?.[0]?.t, 0);
        if (wtn > 0) manual_verified_net_thb = wtn;
      }

      const manual_ledger_net_thb = manual_verified_net_thb;

      const actual_cash_in_bank_approx_thb = manual_gross_approx + payso_received_net;
      const actual_cash_reserve_thb = Math.max(0, actual_cash_in_bank_approx_thb - total_approved_payouts_thb);

      const withdrawal_fee_collected_thb = num(feeWithdrawR.rows?.[0]?.t, 0);
      const payso_deposit_entry_fees_thb = num(feeDepositR.rows?.[0]?.t, 0);
      const realized_profit_estimate_thb =
        Math.round((withdrawal_fee_collected_thb + payso_deposit_entry_fees_thb) * 100) / 100;

      const critical_warning_cash_reserve_below_pending = actual_cash_reserve_thb < pending_payouts_total_thb;

      res.json({
        total_user_credit_thb,
        actual_cash_reserve_thb,
        actual_cash_in_bank_approx_thb,
        pending_payouts_total_thb,
        critical_warning_cash_reserve_below_pending,
        withdrawal_fee_collected_thb,
        payso_deposit_entry_fees_thb,
        realized_profit_estimate_thb,
        system_total_user_wallet_balance_thb: total_user_credit_thb,
        breakdown: {
          manual_verified_net_thb,
          manual_approved_gross_thb: manual_gross_approx,
          payso_settled_net_to_users_thb: payso_received_net,
          payso_pending_settlement_net_thb: payso_pending_net,
          manual_ledger_net_thb,
          total_approved_payouts_thb,
          admin_debit_total_thb,
          admin_credit_total_thb,
        },
        note:
          'สรุปจาก wallet_transactions (ถ้ามีคอลัมน์ครบ) + fallback payment_ledger_audit metadata; ยอดถอนรอจาก payout_requests; การจ่ายจริงสะสมจาก payment_ledger_audit user_payout_withdrawal',
      });
    } catch (e) {
      slog('GET liquidity-summary', e?.message || e);
      res.status(500).json({ error: 'สรุปสภาพคล่องไม่สำเร็จ' });
    }
  });

  app.get('/api/admin/wallet/settlement-projection', adminAuthMiddleware, async (req, res) => {
    try {
      const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 14));
      /** @type {number} */
      let paysoPipe = 0;
      /** @type {number} */
      let pipeRows = 0;
      /** @type {number} */
      let nwTotal = 0;
      /** @type {number} */
      let nwRows = 0;
      /** @type {Array<{available_on:string,total_thb:number,row_count:number}>} */
      let cash_flow_projection = [];

      try {
        const pipe = await pool.query(
          `SELECT COALESCE(SUM(COALESCE(net_amount_thb, 0)), 0)::numeric AS t, COUNT(*)::bigint AS c
           FROM wallet_transactions
           WHERE funding_source = 'PAYSO'
             AND settlement_status = 'PENDING_SETTLEMENT'`,
        );
        paysoPipe = num(pipe.rows?.[0]?.t, 0);
        pipeRows = Number(pipe.rows?.[0]?.c || 0);
        const nw = await pool.query(
          `SELECT COALESCE(SUM(COALESCE(net_amount_thb, 0)), 0)::numeric AS t, COUNT(*)::bigint AS c
           FROM wallet_transactions
           WHERE settlement_status = 'PENDING_SETTLEMENT'
             AND COALESCE(is_withdrawable, false) = false`,
        );
        nwTotal = num(nw.rows?.[0]?.t, paysoPipe);
        nwRows = Number(nw.rows?.[0]?.c || pipeRows);
        const proj = await pool.query(
          `SELECT available_on::date AS d,
                  SUM(COALESCE(net_amount_thb, 0))::numeric AS total_thb,
                  COUNT(*)::bigint AS row_count
           FROM wallet_transactions
           WHERE settlement_status = 'PENDING_SETTLEMENT'
             AND COALESCE(is_withdrawable, false) = false
             AND available_on IS NOT NULL
             AND available_on <= ((NOW() AT TIME ZONE $2)::date + ($1 || ' days')::interval)
           GROUP BY available_on::date
           ORDER BY available_on`,
          [String(days), BANK_TZ],
        );
        cash_flow_projection = (proj.rows || []).map((r) => ({
          available_on: isoDateBangkok(r.d),
          total_thb: num(r.total_thb, 0),
          row_count: Number(r.row_count || 0),
        }));
      } catch (inner) {
        if (inner.code === '42703' || inner.code === '42P01') {
          const fb = await pool
            .query(
              `SELECT COALESCE(SUM(COALESCE(net_amount, amount, 0)), 0)::numeric AS t, COUNT(*)::bigint AS c
               FROM payment_ledger_audit
               WHERE event_type = 'wallet_deposit'
                 AND COALESCE(metadata->>'settlement_status','') = 'PENDING_SETTLEMENT'`,
            )
            .catch(() => ({ rows: [{ t: 0, c: 0 }] }));
          paysoPipe = num(fb.rows?.[0]?.t, 0);
          pipeRows = Number(fb.rows?.[0]?.c || 0);
          nwTotal = paysoPipe;
          nwRows = pipeRows;
          cash_flow_projection = [];
        } else {
          throw inner;
        }
      }

      res.json({
        horizon_days: days,
        timezone: BANK_TZ,
        payso_settlement_pipeline_locked_thb: Math.round(paysoPipe * 100) / 100,
        payso_settlement_pipeline_row_count: pipeRows,
        not_withdrawable_total_locked_thb: Math.round(nwTotal * 100) / 100,
        not_withdrawable_row_count: nwRows,
        cash_flow_projection,
      });
    } catch (e) {
      slog('GET settlement-projection', e?.message || e);
      res.status(500).json({ error: 'โหลด projection ไม่สำเร็จ' });
    }
  });

  app.get('/api/admin/reports/daily-reconcile', adminAuthMiddleware, async (req, res) => {
    try {
      const dateRaw = String(req.query.date || '').trim() || todayBangkokDateString();
      const format = String(req.query.format || 'json').toLowerCase();

      const r = await pool
        .query(
          `
        SELECT d.id, d.user_id,
               COALESCE(NULLIF(TRIM(COALESCE(d.bank_ref_id, '')::text), '')::text, NULL) AS bank_ref_id,
               d.amount, d.reviewed_by, d.reviewed_at, d.ledger_id,
               u.email AS user_email
        FROM manual_deposits d
        LEFT JOIN users u ON u.id = d.user_id
        WHERE d.status = 'approved'
          AND d.reviewed_at IS NOT NULL
          AND (d.reviewed_at AT TIME ZONE $2)::date = $1::date
        ORDER BY d.reviewed_at ASC
      `,
          [dateRaw, BANK_TZ],
        )
        .catch((err) => {
          slog('daily-reconcile query', err?.message || err);
          return { rows: [], _fail: err };
        });

      if (!r.rows) {
        return res.status(500).json({ error: 'รายงานผิดพลาด' });
      }

      const rows = (r.rows || []).map((row) => ({
        id: String(row.id),
        user_id: row.user_id ? String(row.user_id) : null,
        bank_ref_id: row.bank_ref_id || null,
        amount_thb: num(row.amount, 0),
        approved_by: row.reviewed_by || null,
        approved_at_bkk: row.reviewed_at ? isoDateTimeBangkok(row.reviewed_at) : '',
        reviewed_at: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
        ledger_id: row.ledger_id ? String(row.ledger_id) : null,
        user_email: row.user_email || null,
        transaction_hash: row.ledger_id ? crypto.createHash('sha256').update(String(row.ledger_id)).digest('hex').slice(0, 40) : null,
      }));

      if (format === 'csv') {
        const BOM = '\uFEFF';
        const header =
          ['id', 'user_id', 'bank_ref_id', 'amount_thb', 'approved_by', 'approved_at_bkk', 'reviewed_at', 'ledger_id', 'user_email', 'transaction_hash'].join(
            ',',
          );
        const lines = rows.map((w) =>
          [
            `"${String(w.id).replace(/"/g, '""')}"`,
            w.user_id ? `"${String(w.user_id).replace(/"/g, '""')}"` : '',
            w.bank_ref_id ? `"${String(w.bank_ref_id).replace(/"/g, '""')}"` : '',
            String(w.amount_thb ?? 0),
            w.approved_by ? `"${String(w.approved_by).replace(/"/g, '""')}"` : '',
            `"${String(w.approved_at_bkk).replace(/"/g, '""')}"`,
            w.reviewed_at ? `"${String(w.reviewed_at).replace(/"/g, '""')}"` : '',
            w.ledger_id ? `"${String(w.ledger_id).replace(/"/g, '""')}"` : '',
            w.user_email ? `"${String(w.user_email).replace(/"/g, '""')}"` : '',
            w.transaction_hash ? `"${String(w.transaction_hash).replace(/"/g, '""')}"` : '',
          ].join(','),
        );
        const csv = BOM + [header, ...lines].join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="daily-reconcile-${dateRaw}.csv"`);
        return res.status(200).send(csv);
      }

      res.json({
        report_date: dateRaw,
        timezone: BANK_TZ,
        count: rows.length,
        rows,
        note:
          rows.length === 0
            ? `ไม่มีรายการ manual_deposits approved ใน ${dateRaw} (เขต ${BANK_TZ})`
            : undefined,
      });
    } catch (e) {
      slog('GET daily-reconcile', e?.message || e);
      res.status(500).json({ error: 'รายงานรายวันไม่สำเร็จ' });
    }
  });
}
