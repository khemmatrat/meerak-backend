import express from "express";
import pg from "pg";
import { assertProdSecrets } from "./lib/prod-guard.js";

const app = express();
app.use(express.json());

const pool = new pg.Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || "escrow",
});

const API_KEY = process.env.ESCROW_API_KEY || "";

assertProdSecrets([{ name: "ESCROW_API_KEY", value: API_KEY }]);

function auth(req, res, next) {
  const key = req.headers["x-escrow-api-key"] || "";
  if (!API_KEY || key === API_KEY) return next();
  return res.status(401).json({ error: "unauthorized" });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "escrow-service" });
});

/** POST /hold — checkout creates HOLD */
app.post("/hold", auth, async (req, res) => {
  const { order_id, amount_micro, merchant_id, buyer_id, idempotency_key, actor = "checkout" } =
    req.body || {};
  if (!order_id || amount_micro == null) {
    return res.status(400).json({ error: "order_id and amount_micro required" });
  }
  try {
    const r = await pool.query(
      `INSERT INTO escrow.ledger (order_id, amount_micro, merchant_id, buyer_id, status, idempotency_key, actor)
       VALUES ($1, $2, $3, $4, 'HOLD', $5, $6)
       ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [order_id, amount_micro, merchant_id, buyer_id, idempotency_key, actor],
    );
    res.status(201).json({ ledger: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /release | /refund — AI agent or admin command */
app.post("/:action", auth, async (req, res) => {
  const action = String(req.params.action || "").toUpperCase();
  if (!["RELEASE", "REFUND", "CANCELLED"].includes(action)) {
    return res.status(400).json({ error: "invalid action" });
  }
  const { order_id, reason, actor = "api" } = req.body || {};
  if (!order_id) return res.status(400).json({ error: "order_id required" });

  try {
    const cur = await pool.query(
      `SELECT * FROM escrow.ledger WHERE order_id = $1 AND status = 'HOLD' ORDER BY created_at DESC LIMIT 1`,
      [order_id],
    );
    if (!cur.rows.length) return res.status(404).json({ error: "no_hold_found" });

    const r = await pool.query(
      `UPDATE escrow.ledger SET status = $1, actor = $2, reason = $3, metadata = metadata || $4::jsonb
       WHERE id = $5 RETURNING *`,
      [action, actor, reason || null, JSON.stringify({ action_at: new Date().toISOString() }), cur.rows[0].id],
    );
    res.json({ ledger: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** GET /order/:orderId */
app.get("/order/:orderId", auth, async (req, res) => {
  const r = await pool.query(
    `SELECT * FROM escrow.ledger WHERE order_id = $1 ORDER BY created_at DESC`,
    [req.params.orderId],
  );
  res.json({ entries: r.rows });
});

/** POST /billing/tier — compute tier fee for merchant */
app.post("/billing/tier", auth, async (req, res) => {
  const { merchant_id, month_key, gross_sales_thb } = req.body || {};
  const threshold = Number(process.env.TIER_FREE_THRESHOLD_THB || 25000);
  const maxFee = Number(process.env.TIER_MAX_RENTAL_FEE_THB || 5000);
  const gross = Number(gross_sales_thb) || 0;
  let rental = 0;
  let tier = "free";
  if (gross >= threshold) {
    tier = gross >= 500000 ? "enterprise" : gross >= 100000 ? "growth" : "starter";
    rental = gross >= 500000 ? maxFee : gross >= 100000 ? 2499 : 999;
  }
  if (merchant_id && month_key) {
    await pool.query(
      `INSERT INTO escrow.merchant_billing_tiers (merchant_id, month_key, gross_sales_thb, rental_fee_thb, tier_label)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (merchant_id) DO UPDATE SET
         month_key = EXCLUDED.month_key,
         gross_sales_thb = EXCLUDED.gross_sales_thb,
         rental_fee_thb = EXCLUDED.rental_fee_thb,
         tier_label = EXCLUDED.tier_label,
         updated_at = NOW()`,
      [merchant_id, month_key, gross, rental, tier],
    );
  }
  res.json({ merchant_id, month_key, gross_sales_thb: gross, rental_fee_thb: rental, tier_label: tier });
});

/** POST /carrier/penalty — P6 SLA breach */
app.post("/carrier/penalty", auth, async (req, res) => {
  const { carrier_code, penalty = 5, reason } = req.body || {};
  if (!carrier_code) return res.status(400).json({ error: "carrier_code required" });
  const r = await pool.query(
    `INSERT INTO escrow.carrier_scores (carrier_code, score, sla_breaches)
     VALUES ($1, 100 - $2, 1)
     ON CONFLICT (carrier_code) DO UPDATE SET
       score = GREATEST(0, escrow.carrier_scores.score - $2),
       sla_breaches = escrow.carrier_scores.sla_breaches + 1,
       updated_at = NOW()
     RETURNING *`,
    [carrier_code, penalty],
  );
  res.json({ carrier: r.rows[0], reason });
});

const port = Number(process.env.PORT || 8091);
app.listen(port, () => console.log(`escrow-service :${port}`));
