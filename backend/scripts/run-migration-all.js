#!/usr/bin/env node
/**
 * รัน migrations ทั้งหมด 001-057 (ตามลำดับ)
 * ข้าม 054 (ต้องรันด้วย postgres แยกต่างหาก)
 *
 * ใช้: node backend/scripts/run-migration-all.js
 *      node backend/scripts/run-migration-all.js --skip-sample   (ข้าม 004 sample data)
 *      node backend/scripts/run-migration-all.js --existing-db   (DB มี schema แล้ว ข้าม 001-003)
 */
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(__dirname, "run-migration.js");

// migrations 001-057 ตามลำดับ (ข้าม 054 ต้องรันด้วย postgres)
const ALL = [
  "001", "002", "003", "004", "005", "006", "007", "008", "009", "010",
  "011", "012", "013", "014", "015", "016", "017", "018", "019", "020",
  "021", "023", "024", "025", "026", "027", "028", "029", "030", "031",
  "032", "033", "034", "035", "036", "037", "038", "039", "040", "041",
  "042", "043", "044", "045", "046", "047", "048", "049", "050", "051",
  "052", "053", "055", "056", "057"
];

const skipSample = process.argv.includes("--skip-sample");
const existingDb = process.argv.includes("--existing-db");
let migrations = ALL;
if (skipSample) migrations = migrations.filter((n) => n !== "004");
if (existingDb) migrations = migrations.filter((n) => !["001", "002", "003"].includes(n));

if (existingDb) console.log("📌 โหมด --existing-db: ข้าม 001-003 (DB มี schema แล้ว)\n");
console.log(`🔄 รัน migrations ทั้งหมด ${migrations.length} ตัว (001-057, ข้าม 054)\n`);

const child = spawn("node", [scriptPath, ...migrations], {
  stdio: "inherit",
  cwd: join(__dirname, "../.."),
});

child.on("close", (code) => {
  if (code === 0) {
    console.log("\n✅ Migrations เสร็จสมบูรณ์");
    console.log("⚠️  Migration 054 (grant legal): รันแยกด้วย postgres ถ้าต้องการ");
    console.log("   psql -U postgres -d meera_db -f backend/db/migrations/054_grant_legal_tables.sql\n");
  }
  process.exit(code);
});
