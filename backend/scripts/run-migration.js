/**
 * รัน migration ตามเลข (017, 018 ฯลฯ)
 * ใช้การตั้งค่า DB จาก root .env เท่านั้น (DB_HOST, DB_PORT, DB_DATABASE, DB_USER, DB_PASSWORD)
 * หรือ DATABASE_URL เมื่อใช้ --use-url
 *
 * Production (Neon / managed Postgres):
 * - ต้องการ SSL: โฮสต์ที่ไม่ใช่ localhost จะเปิด ssl.rejectUnauthorized (ยกเว้นตั้ง DATABASE_SSL_DISABLE=1)
 * - ถ้าใบรับรองมีปัญหา: PGSSLMODE=no-verify หรือ NODE_TLS_REJECT_UNAUTHORIZED=0 (ไม่แนะนำใน prod จริง)
 * - Timeout: DB_CONNECTION_TIMEOUT_MS (default 60000 ms)
 *
 * วิธีใช้ (จาก root โปรเจกต์): npm run migrate -- 017 018
 * หรือจาก backend: node scripts/run-migration.js 017 018
 */
import pg from "pg";
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, "..");
const rootDir = join(backendDir, "..");
const migrationsDir = join(backendDir, "db", "migrations");

// โหลด .env: backend ก่อน แล้ว root (ถ้ามี) ทับ — รองรับโปรเจกต์ที่ไม่มี .env ที่ root
dotenv.config({ path: join(backendDir, ".env") });
dotenv.config({ path: join(rootDir, ".env") });

const argv = process.argv.slice(2);
const useUrlFlag = argv.includes("--use-url");
const debugFlag = argv.includes("--debug");
const args = argv.filter((a) => /^\d{3}$/.test(a));
if (args.length === 0) {
  console.log("Usage: node scripts/run-migration.js [--use-url] <number> [number ...]");
  console.log("Example: node scripts/run-migration.js 017 018");
  console.log("         node scripts/run-migration.js --use-url 017 018   (use DATABASE_URL e.g. Neon)");
  console.log("Available migrations:", readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).map((f) => f.slice(0, 3)).join(", "));
  process.exit(1);
}

const useUrl = (useUrlFlag || process.env.USE_DATABASE_URL === "1") && process.env.DATABASE_URL;

/** Neon / managed Postgres มักต้องใช้ SSL; localhost ไม่ใช้ */
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
      max: 5,
    };
  }
  const connectionString = process.env.DATABASE_URL;
  const sslExplicitOff = process.env.DATABASE_SSL_DISABLE === "1" || process.env.DATABASE_SSL_DISABLE === "true";
  let ssl = false;
  if (!sslExplicitOff && connectionString) {
    try {
      const href = connectionString.replace(/^postgres(ql)?:\/\//, "https://");
      const u = new URL(href);
      const host = u.hostname;
      const isLocal =
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host.endsWith(".local");
      if (!isLocal) {
        const noVerify = process.env.PGSSLMODE === "no-verify" || process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0";
        ssl = { rejectUnauthorized: !noVerify };
      }
    } catch {
      ssl = { rejectUnauthorized: process.env.PGSSLMODE !== "no-verify" };
    }
  }
  return {
    connectionString,
    ssl,
    connectionTimeoutMillis: timeoutMs,
    max: 5,
  };
}

const poolConfig = buildPoolConfig();

if (useUrl) {
  const raw = process.env.DATABASE_URL;
  const href = (raw || "").replace(/^postgres(ql)?:\/\//, "https://");
  let host = "DATABASE_URL";
  try {
    host = new URL(href).hostname;
  } catch {
    /* ignore */
  }
  console.log("Using DATABASE_URL host:", host, "| SSL:", poolConfig.ssl ? "on" : "off", "| connect timeout ms:", poolConfig.connectionTimeoutMillis);
} else {
  const dbUser = process.env.DB_USER || "meera";
  console.log("Using DB (same as backend):", process.env.DB_HOST || "localhost", process.env.DB_DATABASE || "meera_db", "user:", dbUser, "| connect timeout ms:", poolConfig.connectionTimeoutMillis);
}

const pool = new pg.Pool(poolConfig);

/** Split SQL by semicolons, respecting $$ ... $$ blocks, strings, and -- comments */
function splitStatements(sql) {
  const out = [];
  let cur = "";
  let i = 0;
  let inDollar = false;
  let inLineComment = false;
  let inString = false;
  let stringChar = null;
  while (i < sql.length) {
    const c = sql[i];
    const c2 = sql.slice(i, i + 2);

    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      cur += c;
      i++;
      continue;
    }
    if (inString) {
      if (c === "\\" && i + 1 < sql.length) {
        cur += c + sql[i + 1];
        i += 2;
        continue;
      }
      if (c === stringChar) inString = false;
      cur += c;
      i++;
      continue;
    }
    if (!inDollar && (c2 === "--" || (c === "-" && sql[i + 1] === "-"))) {
      inLineComment = true;
      cur += c;
      i++;
      continue;
    }
    if (!inDollar && (c === "'" || c === '"')) {
      inString = true;
      stringChar = c;
      cur += c;
      i++;
      continue;
    }
    if (c2 === "$$" && !inDollar) {
      inDollar = true;
      cur += "$$";
      i += 2;
      continue;
    }
    if (inDollar && c2 === "$$") {
      inDollar = false;
      cur += "$$";
      i += 2;
      continue;
    }
    if (!inDollar && c === ";") {
      const s = (cur + ";").trim();
      const noLeadingComments = s.replace(/^\s*--[^\n]*\n?/gm, "").trim();
      if (s && noLeadingComments) out.push(s);
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  const tail = cur.trim();
  if (tail) out.push(tail);
  return out;
}

function findMigrationFile(num) {
  const files = readdirSync(migrationsDir);
  const name = `${String(num).padStart(3, "0")}_`;
  const found = files.find((f) => f.startsWith(name) && f.endsWith(".sql"));
  return found ? join(migrationsDir, found) : null;
}

async function runMigration(num) {
  const path = findMigrationFile(num);
  if (!path) {
    console.warn(`⚠️  No migration file for ${num}`);
    return false;
  }
  const dbUser = process.env.DB_USER || (poolConfig.user ?? "meera");
  const dbName = poolConfig.database || process.env.DB_DATABASE || "(database from URL)";
  // 054 ต้องรันด้วย postgres เท่านั้น (GRANT ให้ meera)
  if (num === "054" && String(dbUser).toLowerCase() !== "postgres") {
    console.warn(`⚠️  Migration 054 ต้องรันด้วย postgres: psql -U postgres -d ${dbName} -f ${path}`);
    return false;
  }
  const sql = readFileSync(path, "utf8");
  const client = await pool.connect();
  try {
    const stmts = splitStatements(sql);
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      const preview = s.slice(0, 60).replace(/\s+/g, " ") + (s.length > 60 ? "..." : "");
      try {
        await client.query(s);
        if (debugFlag) console.log(`  [${i + 1}/${stmts.length}] OK: ${preview}`);
      } catch (e) {
        console.error(`❌ Migration ${num} failed at statement ${i + 1}/${stmts.length}:`, e.message);
        if (debugFlag) console.error(`   Statement: ${preview}`);
        throw e;
      }
    }
    console.log(`✅ Migration ${num} ran successfully (${path.split(/[/\\]/).pop()})`);
    return true;
  } catch (err) {
    if (!debugFlag) {
      console.error(`❌ Migration ${num} failed:`, err.message);
      if (err.position) {
        const before = sql.slice(0, err.position);
        const line = (before.match(/\n/g) || []).length + 1;
        const col = before.length - before.lastIndexOf("\n");
        console.error(`   At position ${err.position} (approx line ${line}, col ${col})`);
      }
    }
    throw err;
  } finally {
    client.release();
  }
}

(async () => {
  try {
    for (const num of args) {
      await runMigration(num);
    }
  } catch (e) {
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
