import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { crewRerank, rulesRerank } from "./lib/crew-client.js";
import { assertProdSecrets, isProduction } from "./lib/prod-guard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "1mb" }));

const pool = new pg.Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || "analytics",
});

const API_KEY = process.env.ANALYTICS_API_KEY || "";
const PUBLIC_INGEST =
  process.env.ANALYTICS_PUBLIC_INGEST === "1" && !isProduction();

assertProdSecrets([
  { name: "ANALYTICS_API_KEY", value: API_KEY },
  { name: "AI_CORE_API_KEY", value: process.env.AI_CORE_API_KEY },
]);

const EVENT_TYPES = [
  "impression",
  "click",
  "add_to_cart",
  "purchase",
  "share",
  "live_join",
  "f_code_view",
  "checkout_start",
];

function auth(req, res, next) {
  const key = req.headers["x-analytics-api-key"] || req.query.key || "";
  if (!API_KEY || key === API_KEY) return next();
  return res.status(401).json({ error: "unauthorized" });
}

async function refreshViews() {
  await pool.query(`REFRESH MATERIALIZED VIEW analytics.stream_conversion_summary`).catch(() => {});
  await pool.query(`REFRESH MATERIALIZED VIEW analytics.product_conversion_summary`).catch(() => {});
  await pool.query(`REFRESH MATERIALIZED VIEW analytics.live_directory_summary`).catch(() => {});
}

async function insertEvent(body) {
  const {
    stream_id,
    merchant_id,
    product_id,
    event_type,
    session_id,
    user_id,
    source,
    metadata,
  } = body || {};
  if (!stream_id || !event_type) {
    throw new Error("stream_id and event_type required");
  }
  if (!EVENT_TYPES.includes(event_type)) {
    throw new Error("invalid event_type");
  }
  await pool.query(
    `INSERT INTO analytics.stream_events
       (stream_id, merchant_id, product_id, event_type, session_id, user_id, source, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      stream_id,
      merchant_id || null,
      product_id || null,
      event_type,
      session_id || null,
      user_id || null,
      source || "web",
      JSON.stringify(metadata || {}),
    ],
  );
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "analytics-service",
    p7: { crew_rerank: true, dashboard: true, public_ingest: PUBLIC_INGEST },
    store: "postgres-lite",
  });
});

app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

/** POST /events — authenticated ingest */
app.post("/events", auth, async (req, res) => {
  try {
    await insertEvent(req.body);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** POST /events/ingest — browser-friendly (open when ANALYTICS_PUBLIC_INGEST=1) */
app.post("/events/ingest", (req, res, next) => {
  if (PUBLIC_INGEST) return next();
  return auth(req, res, next);
}, async (req, res) => {
  try {
    await insertEvent(req.body);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** POST /events/batch */
app.post("/events/batch", auth, async (req, res) => {
  const events = req.body?.events;
  if (!Array.isArray(events) || !events.length) {
    return res.status(400).json({ error: "events array required" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const ev of events) await insertEvent(ev);
    await client.query("COMMIT");
    res.status(201).json({ ok: true, count: events.length });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

/** GET /streams/ranked — SQL-only ranking */
app.get("/streams/ranked", auth, async (req, res) => {
  const limit = Math.min(50, parseInt(req.query.limit || "20", 10));
  await refreshViews();
  const r = await pool.query(
    `SELECT stream_id, impressions, clicks, purchases, conversion_rate_pct
     FROM analytics.stream_conversion_summary
     WHERE impressions > 0
     ORDER BY conversion_rate_pct DESC, purchases DESC, clicks DESC
     LIMIT $1`,
    [limit],
  );
  res.json({ ok: true, ranked: r.rows, source: "sql" });
});

/** GET /live/directory — ranked live rooms (public read) */
app.get("/live/directory", async (req, res) => {
  const limit = Math.min(30, parseInt(req.query.limit || "10", 10));
  await refreshViews();
  const r = await pool.query(
    `SELECT stream_id, merchant_id, live_joins, impressions, purchases, conversion_rate_pct, last_active_at
     FROM analytics.live_directory_summary
     ORDER BY conversion_rate_pct DESC, live_joins DESC, last_active_at DESC
     LIMIT $1`,
    [limit],
  );
  res.json({ ok: true, live_streams: r.rows });
});

/** GET /products/ranked — catalog conversion ranking */
app.get("/products/ranked", auth, async (req, res) => {
  const limit = Math.min(50, parseInt(req.query.limit || "20", 10));
  await refreshViews();
  const r = await pool.query(
    `SELECT product_id, impressions, clicks, f_code_views, purchases, conversion_rate_pct, last_event_at
     FROM analytics.product_conversion_summary
     WHERE impressions > 0 OR f_code_views > 0
     ORDER BY conversion_rate_pct DESC, purchases DESC
     LIMIT $1`,
    [limit],
  );
  res.json({ ok: true, ranked: r.rows, source: "sql" });
});

/** POST /rerank — CrewAI via ai-core (streams | products | live) */
app.post("/rerank", auth, async (req, res) => {
  const entityType = req.body?.entity_type || "live";
  const limit = Math.min(50, parseInt(req.body?.limit || "20", 10));
  await refreshViews();

  let candidates = [];
  if (entityType === "product") {
    const r = await pool.query(
      `SELECT product_id, impressions, clicks, f_code_views, purchases, conversion_rate_pct
       FROM analytics.product_conversion_summary
       ORDER BY conversion_rate_pct DESC LIMIT $1`,
      [limit],
    );
    candidates = r.rows.map((row) => ({ ...row, id: row.product_id }));
  } else if (entityType === "live") {
    const r = await pool.query(
      `SELECT stream_id, merchant_id, live_joins, impressions, purchases, conversion_rate_pct
       FROM analytics.live_directory_summary
       ORDER BY conversion_rate_pct DESC LIMIT $1`,
      [limit],
    );
    candidates = r.rows.map((row) => ({ ...row, id: row.stream_id }));
  } else {
    const r = await pool.query(
      `SELECT stream_id, impressions, clicks, purchases, conversion_rate_pct
       FROM analytics.stream_conversion_summary
       ORDER BY conversion_rate_pct DESC LIMIT $1`,
      [limit],
    );
    candidates = r.rows.map((row) => ({ ...row, id: row.stream_id }));
  }

  if (!candidates.length) {
    return res.json({ ok: true, ranked: [], note: "no analytics data yet" });
  }

  const crew = await crewRerank({
    entity_type: entityType,
    candidates,
    context: req.body?.context || {},
  });

  if (crew.ok && crew.ranked) {
    return res.json({
      ok: true,
      entity_type: entityType,
      source: crew.source || "hermes_crew",
      ranked: crew.ranked,
      crew_notes: crew.crew_notes,
    });
  }

  const fallback = rulesRerank(candidates);
  res.json({
    ok: true,
    entity_type: entityType,
    source: "rules_fallback",
    ranked: fallback.ranked,
    crew_error: crew.error,
  });
});

/** GET /summary — dashboard metrics */
app.get("/summary", auth, async (req, res) => {
  await refreshViews();
  const [events, streams, products, live] = await Promise.all([
    pool.query(`SELECT event_type, COUNT(*)::int AS cnt FROM analytics.stream_events GROUP BY event_type`),
    pool.query(`SELECT COUNT(*)::int AS cnt FROM analytics.stream_conversion_summary`),
    pool.query(`SELECT COUNT(*)::int AS cnt FROM analytics.product_conversion_summary`),
    pool.query(`SELECT COUNT(*)::int AS cnt FROM analytics.live_directory_summary`),
  ]);
  res.json({
    ok: true,
    event_counts: events.rows,
    stream_count: streams.rows[0]?.cnt || 0,
    product_count: products.rows[0]?.cnt || 0,
    live_count: live.rows[0]?.cnt || 0,
  });
});

app.get("/streams/:id/metrics", auth, async (req, res) => {
  const r = await pool.query(
    `SELECT event_type, COUNT(*)::int AS cnt
     FROM analytics.stream_events WHERE stream_id = $1
     GROUP BY event_type`,
    [req.params.id],
  );
  res.json({ stream_id: req.params.id, metrics: r.rows });
});

const port = Number(process.env.PORT || 8095);
app.listen(port, () => console.log(`analytics-service :${port} (P7 CrewAI re-rank)`));
