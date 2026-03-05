/**
 * รัน migration ตามเลข (017, 018 ฯลฯ)
 * ใช้การตั้งค่า DB จาก root .env เท่านั้น (DB_HOST, DB_PORT, DB_DATABASE, DB_USER, DB_PASSWORD)
 * หรือ DATABASE_URL เมื่อใช้ --use-url
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

// โหลด .env จาก root โปรเจกต์เท่านั้น (ใช้ตัวเดียวกับ server.js)
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
const poolConfig = useUrl
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432", 10),
      database: process.env.DB_DATABASE || "meera_db",
      user: process.env.DB_USER || "meera",
      password: process.env.DB_PASSWORD || "meera123",
    };
if (useUrl) {
  const raw = process.env.DATABASE_URL;
  const href = (raw || "").replace(/^postgres(ql)?:\/\//, "https://");
  const host = href ? new URL(href).hostname : "DATABASE_URL";
  console.log("Using DATABASE_URL (e.g. Neon):", host);
} else {
  const dbUser = process.env.DB_USER || "meera";
  console.log("Using DB (same as backend):", process.env.DB_HOST || "localhost", process.env.DB_DATABASE || "meera_db", "user:", dbUser);
}

const pool = new pg.Pool(poolConfig);

/** Split SQL by semicolons, respecting $$ ... $$ blocks */
function splitStatements(sql) {
  const out = [];
  let cur = "";
  let i = 0;
  let inDollar = false;
  while (i < sql.length) {
    if (sql.slice(i, i + 2) === "$$" && !inDollar) {
      inDollar = true;
      cur += "$$";
      i += 2;
      continue;
    }
    if (inDollar && sql.slice(i, i + 2) === "$$") {
      inDollar = false;
      cur += "$$";
      i += 2;
      continue;
    }
    if (!inDollar && sql[i] === ";") {
      const s = (cur + ";").trim();
      // Skip only if statement is purely comments/whitespace (leading comments are OK)
      const noLeadingComments = s.replace(/^\s*--[^\n]*\n?/gm, "").trim();
      if (s && noLeadingComments) out.push(s);
      cur = "";
      i++;
      continue;
    }
    cur += sql[i];
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
  // 054 ต้องรันด้วย postgres เท่านั้น (GRANT ให้ meera)
  if (num === "054" && String(dbUser).toLowerCase() !== "postgres") {
    console.warn(`⚠️  Migration 054 ต้องรันด้วย postgres: psql -U postgres -d ${poolConfig.database} -f ${path}`);
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
