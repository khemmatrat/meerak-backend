import express from "express";
import mysql from "mysql2/promise";

const app = express();
app.use(express.json({ limit: "2mb" }));

const SYNC_KEY = process.env.BAGISTO_AQOND_SYNC_KEY || process.env.BAGISTO_WEBHOOK_SECRET || "";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "bagisto-mysql",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "bagisto",
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || "bagisto",
  waitForConnections: true,
  connectionLimit: 5,
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aqond_products (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      external_id VARCHAR(64) NOT NULL UNIQUE,
      title VARCHAR(240) NOT NULL,
      category VARCHAR(120) NOT NULL DEFAULT 'general',
      description TEXT,
      price_thb DECIMAL(12,2) NOT NULL DEFAULT 0,
      inventory INT NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      image_urls JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function auth(req, res, next) {
  const key = req.headers["x-aqond-sync-key"] || "";
  if (SYNC_KEY && key !== SYNC_KEY) return res.status(403).json({ error: "invalid_sync_key" });
  return next();
}

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, service: "bagisto-bridge", note: "MySQL mirror — upgrade to full Bagisto via install-bagisto.sh" });
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

/** Contract for sync-service mirrorProductToBagisto */
app.post("/aqond-api/v1/products", auth, async (req, res) => {
  const b = req.body || {};
  const externalId = String(b.external_id || "");
  if (!externalId) return res.status(400).json({ error: "external_id required" });

  const title = String(b.title || "Untitled").slice(0, 240);
  const category = String(b.category || "general").slice(0, 120);
  const description = String(b.description || "").slice(0, 5000);
  const price = Number(b.price_thb ?? b.price ?? 0);
  const inventory = Math.max(0, Math.round(Number(b.inventory ?? 1)));
  const status = b.status === "published" ? "published" : "draft";
  const images = JSON.stringify(Array.isArray(b.image_uris) ? b.image_uris : []);

  await pool.query(
    `INSERT INTO aqond_products (external_id, title, category, description, price_thb, inventory, status, image_urls)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       category = VALUES(category),
       description = VALUES(description),
       price_thb = VALUES(price_thb),
       inventory = VALUES(inventory),
       status = VALUES(status),
       image_urls = VALUES(image_urls)`,
    [externalId, title, category, description, price, inventory, status, images],
  );

  const [rows] = await pool.query(`SELECT id FROM aqond_products WHERE external_id = ?`, [externalId]);
  const bagistoId = rows[0]?.id;

  res.status(201).json({
    ok: true,
    bagisto_product_id: bagistoId,
    external_id: externalId,
    mirror: "mysql_aqond_products",
  });
});

app.get("/aqond-api/v1/products", auth, async (_req, res) => {
  const [rows] = await pool.query(`SELECT * FROM aqond_products ORDER BY updated_at DESC LIMIT 100`);
  res.json({ ok: true, products: rows });
});

const port = Number(process.env.PORT || 8089);
initSchema()
  .then(() => {
    app.listen(port, () => console.log(`bagisto-bridge :${port} → MySQL ${process.env.MYSQL_HOST}`));
  })
  .catch((e) => {
    console.error("schema init failed:", e);
    process.exit(1);
  });
