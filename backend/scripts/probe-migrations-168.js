#!/usr/bin/env node
/**
 * สำรวจว่า migration 168–176 (ไฟล์ที่มีใน repo) รันแล้วหรือยัง — เทียบจากตาราง/คอลัมน์สำคัญ
 */
import pg from "pg";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, "..");
const rootDir = join(backendDir, "..");
dotenv.config({ path: join(backendDir, ".env") });
dotenv.config({ path: join(rootDir, ".env") });

const useUrl = process.env.USE_DATABASE_URL === "1" && process.env.DATABASE_URL;

function buildPoolConfig() {
  const timeoutMs = Math.min(
    Math.max(parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || "60000", 10) || 60000, 5000),
    120000
  );
  if (!useUrl) {
    return {
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432", 10),
      database: process.env.DB_DATABASE || "meera_db",
      user: process.env.DB_USER || "meera",
      password: process.env.DB_PASSWORD || "meera123",
      connectionTimeoutMillis: timeoutMs,
      max: 2,
    };
  }
  const connectionString = process.env.DATABASE_URL;
  const sslExplicitOff = process.env.DATABASE_SSL_DISABLE === "1";
  let ssl = false;
  if (!sslExplicitOff && connectionString) {
    try {
      const href = connectionString.replace(/^postgres(ql)?:\/\//, "https://");
      const host = new URL(href).hostname;
      const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
      if (!isLocal) ssl = { rejectUnauthorized: process.env.PGSSLMODE !== "no-verify" };
    } catch {
      ssl = { rejectUnauthorized: true };
    }
  }
  return { connectionString, ssl, connectionTimeoutMillis: timeoutMs, max: 2 };
}

const CHECKS = [
  {
    id: "168",
    file: "168_home_banners_promo_vouchers_ledger.sql",
    sql: `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_promo_vouchers') AS ok`,
  },
  {
    id: "172",
    file: "172_payment_gateway_registry_super_admin.sql",
    sql: `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_gateway_registry') AS ok`,
  },
  {
    id: "173",
    file: "173_promo_banner_advanced_rules.sql",
    sql: `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'home_banners' AND column_name = 'discount_mode'
    ) AS ok`,
  },
  {
    id: "174",
    file: "174_promo_schedule_job_categories.sql",
    sql: `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'home_banners' AND column_name = 'promo_valid_from'
    ) AS ok`,
  },
  {
    id: "175",
    file: "175_home_banners_promo_claims_enabled.sql",
    sql: `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'home_banners' AND column_name = 'promo_claims_enabled'
    ) AS ok`,
  },
  {
    id: "176",
    file: "176_video_feed_views_shares_saves.sql",
    sql: `SELECT (
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'video_shares')
      OR EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'talent_videos' AND column_name = 'view_count'
      )
    ) AS ok`,
  },
];

const pool = new pg.Pool(buildPoolConfig());

(async () => {
  try {
    const pending = [];
    const done = [];
    for (const c of CHECKS) {
      const r = await pool.query(c.sql);
      const ok = !!r.rows?.[0]?.ok;
      if (ok) done.push(c);
      else pending.push(c);
      console.log(`${ok ? "✅" : "⏳"} ${c.id} ${c.file} → ${ok ? "พบแล้ว (น่าจะรันแล้ว)" : "ยังไม่พบ — ควรรัน"}`);
    }
    console.log("\n--- สรุป ---");
    console.log(`รันแล้ว (ประมาณการ): ${done.length} / ${CHECKS.length}`);
    console.log(`ยังขาด: ${pending.length}${pending.length ? ` → ${pending.map((p) => p.id).join(", ")}` : ""}`);
    if (pending.length) {
      console.log(`\nรันคำสั่ง (จาก root โปรเจกต์):\n  npm run migrate -- ${pending.map((p) => p.id).join(" ")}`);
    }
  } catch (e) {
    console.error("❌ เชื่อมต่อหรือ query ล้มเหลว:", e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
