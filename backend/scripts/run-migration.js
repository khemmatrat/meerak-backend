/**
 * รัน migration ตามเลข (017, 018 ฯลฯ)
 * - เก็บประวัติใน Postgres ตาราง schema_applied_migrations → ข้ามไฟล์ที่รันแล้วโดยอัตโนมัติ
 * - เลขเดียวกันแต่หลายไฟล์ (เช่น 154_...) จะรันทุกไฟล์เรียงชื่อ และ track แยกตาม filename
 *
 * ใช้การตั้งค่า DB จาก root .env เท่านั้น (DB_HOST, ...)
 * หรือ DATABASE_URL เมื่อใช้ --use-url
 *
 * วิธีใช้:
 *   node scripts/run-migration.js 017 018
 *   node scripts/run-migration.js --pending-min 150        # เฉพาะเลขและไฟล์ที่ยังไม่เคยรัน
 *   node scripts/run-migration.js --status                   # APPLIED / PENDING ทั้ง repo
 *   node scripts/run-migration.js --list-pending             # พิมพ์เฉพาะเลขที่ยังไม่ครบ
 *   node scripts/run-migration.js --record-baseline 004 149  # บันทึกว่ารันแล้วโดยไม่รัน SQL (สำหรับ DB เดิมที่มือมาก่อน)
 *   node scripts/run-migration.js --force 186                # รันซ้ำแม้เคยรันแล้ว
 *
 * Production (Neon): --use-url
 */
import pg from "pg";
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { basename, dirname, join } from "path";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, "..");
const rootDir = join(backendDir, "..");
const migrationsDir = join(backendDir, "db", "migrations");

dotenv.config({ path: join(backendDir, ".env") });
dotenv.config({ path: join(rootDir, ".env") });

/** เวลา pipe ไป `head` / `grep` reader ปิดเร็ว → EPIPE — อย่าให้เป็น unhandled error */
function silenceBrokenPipe(stream) {
  stream.on("error", (err) => {
    if (!err || err.code !== "EPIPE") return;
    process.exit(0);
  });
}
silenceBrokenPipe(process.stdout);
silenceBrokenPipe(process.stderr);

const argv = process.argv.slice(2);
const useUrlFlag = argv.includes("--use-url");
const debugFlag = argv.includes("--debug");
const forceFlag = argv.includes("--force");
const statusFlag = argv.includes("--status");
const listPendingFlag = argv.includes("--list-pending");

function argValue(flag) {
  const i = argv.indexOf(flag);
  if (i < 0) return null;
  return argv[i + 1] || null;
}

const pendingMinArg = argValue("--pending-min");
const baselineFrom = argValue("--record-baseline");
const baselineTo = baselineFrom ? argv[argv.indexOf("--record-baseline") + 2] || null : null;

const positionalNums = argv.filter((a) => /^\d{3}$/.test(a));

const useUrl = (useUrlFlag || process.env.USE_DATABASE_URL === "1") && process.env.DATABASE_URL;

function buildPoolConfig() {
  const timeoutMs = Math.min(
    Math.max(parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || "60000", 10) || 60000, 5000),
    120000,
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
  const sslExplicitOff =
    process.env.DATABASE_SSL_DISABLE === "1" || process.env.DATABASE_SSL_DISABLE === "true";
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
        const noVerify =
          process.env.PGSSLMODE === "no-verify" || process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0";
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
const pool = new pg.Pool(poolConfig);

function printDbTarget() {
  if (useUrl) {
    const raw = process.env.DATABASE_URL;
    const href = (raw || "").replace(/^postgres(ql)?:\/\//, "https://");
    let host = "DATABASE_URL";
    try {
      host = new URL(href).hostname;
    } catch {
      /* ignore */
    }
    console.log(
      "Using DATABASE_URL host:",
      host,
      "| SSL:",
      poolConfig.ssl ? "on" : "off",
      "| connect timeout ms:",
      poolConfig.connectionTimeoutMillis,
    );
  } else {
    const dbUser = process.env.DB_USER || "meera";
    console.log(
      "Using DB (same as backend):",
      process.env.DB_HOST || "localhost",
      process.env.DB_DATABASE || "meera_db",
      "user:",
      dbUser,
      "| connect timeout ms:",
      poolConfig.connectionTimeoutMillis,
    );
  }
}

async function ensureMigrationLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_applied_migrations (
      filename TEXT PRIMARY KEY,
      migration_number TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_schema_applied_migrations_number
    ON schema_applied_migrations(migration_number);
  `);
}

/** ทุกไฟล์ NNN_name.sql (เรียงเลขแล้วชื่อไฟล์) */
function listMigrationArtifacts() {
  const names = readdirSync(migrationsDir).filter((f) => /^\d{3}_/.test(f) && f.endsWith(".sql"));
  const out = names.map((name) => ({
    basename: name,
    num: name.slice(0, 3),
    n: parseInt(name.slice(0, 3), 10),
    path: join(migrationsDir, name),
  }));
  out.sort((a, b) => a.n - b.n || a.basename.localeCompare(b.basename));
  return out;
}

function artifactsForNumber(paddedThree) {
  const p = String(paddedThree).padStart(3, "0");
  return listMigrationArtifacts().filter((a) => a.num === p);
}

async function isFileApplied(client, filename) {
  const r = await client.query(`SELECT 1 FROM schema_applied_migrations WHERE filename = $1 LIMIT 1`, [
    filename,
  ]);
  return r.rows.length > 0;
}

async function recordApplied(client, filename, migrationNumber) {
  await client.query(
    `INSERT INTO schema_applied_migrations (filename, migration_number, applied_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (filename) DO UPDATE SET applied_at = EXCLUDED.applied_at`,
    [filename, migrationNumber],
  );
}

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

async function execSqlFile(client, absolutePath) {
  const sql = readFileSync(absolutePath, "utf8");
  const stmts = splitStatements(sql);
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    const preview = s.slice(0, 60).replace(/\s+/g, " ") + (s.length > 60 ? "..." : "");
    try {
      await client.query(s);
      if (debugFlag) console.log(`  [${i + 1}/${stmts.length}] OK: ${preview}`);
    } catch (e) {
      console.error(`❌ failed at statement ${i + 1}/${stmts.length}:`, e.message);
      if (debugFlag) console.error(`   Statement: ${preview}`);
      throw e;
    }
  }
}

async function runOneMigrationFile(absPath, { force }) {
  const fname = basename(absPath);
  const numPrefix = fname.slice(0, 3);
  const dbUser = process.env.DB_USER || (poolConfig.user ?? "meera");
  const dbName = poolConfig.database || process.env.DB_DATABASE || "(database from URL)";

  // 054 ต้องรันด้วย postgres เท่านั้น (GRANT ให้ meera)
  if (fname.startsWith("054_") && String(dbUser).toLowerCase() !== "postgres") {
    console.warn(`⚠️  ${fname} ต้องรันด้วย postgres: psql -U postgres -d ${dbName} -f ${absPath}`);
    return false;
  }

  const client = await pool.connect();
  try {
    await ensureMigrationLedger(client);
    if (!force && (await isFileApplied(client, fname))) {
      console.log(`⏭️  skipped (already applied): ${fname}`);
      return false;
    }
    await execSqlFile(client, absPath);
    await recordApplied(client, fname, numPrefix);
    console.log(`✅ Migration ran successfully (${fname})`);
    return true;
  } catch (err) {
    console.error(`❌ Migration failed (${fname}):`, err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function printStatus() {
  const client = await pool.connect();
  try {
    await ensureMigrationLedger(client);
    const all = listMigrationArtifacts();
    let appliedCount = 0;
    console.log(`${"FILE".padEnd(52)} STATUS`);
    console.log("-".repeat(60));
    for (const a of all) {
      const ok = await isFileApplied(client, a.basename);
      if (ok) appliedCount += 1;
      console.log(`${a.basename.padEnd(52)} ${ok ? "APPLIED" : "PENDING"}`);
    }
    if (appliedCount === 0 && all.length > 0) {
      console.log("");
      console.log(
        "ℹ️  ยังไม่มีแถวใน schema_applied_migrations — ทุกไฟล์จึงเป็น PENDING (ไม่ได้แปลว่า DB ว่าง)",
      );
      console.log(
        "   ถ้า DB นี้เคยรัน migration มาก่อนแล้ว: ใช้ --record-baseline FROM TO เพื่อจารึกช่วงที่มั่นใจ",
      );
      console.log("   จากนั้นใช้ --pending-min N เพื่อรันเฉพาะไฟล์ที่เหลือ\n");
    }
  } finally {
    client.release();
  }
}

async function printListPendingOnly() {
  const client = await pool.connect();
  try {
    await ensureMigrationLedger(client);
    const all = listMigrationArtifacts();
    const pending = [];
    for (const a of all) {
      if (!(await isFileApplied(client, a.basename))) pending.push(`${a.num} ${a.basename}`);
    }
    if (pending.length === 0) console.log("(no pending migration files)");
    else pending.forEach((l) => console.log(l));
  } finally {
    client.release();
  }
}

function parseBaselineRange(fromRaw, toRaw) {
  if (!/^\d{1,3}$/.test(fromRaw || "") || !/^\d{1,3}$/.test(toRaw || ""))
    throw new Error("--record-baseline needs two args: FROM TO (e.g. 004 149)");
  const from = Math.min(parseInt(fromRaw, 10), parseInt(toRaw, 10));
  const to = Math.max(parseInt(fromRaw, 10), parseInt(toRaw, 10));
  return { from, to };
}

async function recordBaseline(fromN, toN) {
  const client = await pool.connect();
  try {
    await ensureMigrationLedger(client);
    console.warn(`⚠️  --record-baseline: inserting APPLIED rows for files in range ${fromN}..${toN} WITHOUT running SQL.`);
    console.warn(`     Use only when this DB truly already has those changes.`);
    const all = listMigrationArtifacts().filter((a) => a.n >= fromN && a.n <= toN);
    for (const a of all) {
      const ins = await client.query(
        `INSERT INTO schema_applied_migrations (filename, migration_number, applied_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (filename) DO NOTHING
         RETURNING filename`,
        [a.basename, a.num],
      );
      if (ins.rowCount) console.log(`   marked APPLIED: ${a.basename}`);
      else console.log(`   (unchanged, already recorded): ${a.basename}`);
    }
    console.log(`✅ baseline pass complete (${all.length} file(s) in range)`);
  } finally {
    client.release();
  }
}

function printUsage() {
  console.log(`
Usage:
  node scripts/run-migration.js [--use-url] [--force] [--debug] <017> [<018> ...]
  node scripts/run-migration.js --pending-min <150>
  node scripts/run-migration.js --status
  node scripts/run-migration.js --list-pending
  node scripts/run-migration.js --record-baseline <from> <to>   # e.g. 004 149 — no SQL executed

Examples:
  node scripts/run-migration.js 017 018
  node scripts/run-migration.js --use-url --pending-min 004
`);
}

function mainDecision() {
  if (statusFlag) return "status";
  if (listPendingFlag) return "list-pending";
  if (baselineFrom && baselineTo) return "baseline";
  if (pendingMinArg != null && String(pendingMinArg).trim() !== "") return "pending-min";
  if (positionalNums.length > 0) return "nums";
  return "help";
}

(async () => {
  try {
    const mode = mainDecision();
    if (mode === "help") {
      printUsage();
      process.exit(1);
    }
    printDbTarget();

    if (mode === "status") {
      await printStatus();
      return;
    }
    if (mode === "list-pending") {
      await printListPendingOnly();
      return;
    }
    if (mode === "baseline") {
      const { from, to } = parseBaselineRange(baselineFrom, baselineTo);
      await recordBaseline(from, to);
      return;
    }

    let artifactsToRun = [];
    if (mode === "pending-min") {
      const n = parseInt(String(pendingMinArg), 10);
      if (Number.isNaN(n)) throw new Error(`invalid --pending-min: ${pendingMinArg}`);
      const all = listMigrationArtifacts().filter((a) => a.n >= n);
      const client = await pool.connect();
      try {
        await ensureMigrationLedger(client);
        for (const a of all) {
          if (!forceFlag && (await isFileApplied(client, a.basename))) continue;
          artifactsToRun.push(a);
        }
      } finally {
        client.release();
      }
      if (artifactsToRun.length === 0) {
        if (all.length === 0) {
          console.log(
            `No .sql migration files in db/migrations with prefix >= ${String(pendingMinArg).padStart(3, "0")}. ` +
            `Nothing to execute — add/sync new files (e.g. 204_*.sql) when the repo ships them.`,
          );
        } else {
          console.log(
            "Nothing to run — every migration file in this range is already marked APPLIED (see schema_applied_migrations).",
          );
        }
        return;
      }
      console.log(`Running ${artifactsToRun.length} pending migration file(s) (>= ${String(pendingMinArg).padStart(3, "0")})...`);
    }

    if (mode === "nums") {
      for (const num of positionalNums) {
        const hits = artifactsForNumber(num);
        if (hits.length === 0) console.warn(`⚠️  No migration file for ${num}`);
        else artifactsToRun.push(...hits);
      }
    }

    const seen = new Set();
    for (const a of artifactsToRun) {
      if (seen.has(a.basename)) continue;
      seen.add(a.basename);
      await runOneMigrationFile(a.path, { force: forceFlag });
    }
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
