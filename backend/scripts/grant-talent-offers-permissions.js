/**
 * รัน GRANT ให้ meera เข้าถึง talent_offers และ bids (ครั้งเดียว)
 * แก้ 500 error: GET /api/bids/offers/open/:talentId
 *
 * ใส่ใน .env: DB_ADMIN_USER=postgres, DB_ADMIN_PASSWORD=รหัสผ่าน
 * รัน: node backend/scripts/grant-talent-offers-permissions.js
 */
import pg from "pg";
import readline from "readline";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", "..", ".env") });

const adminUser = process.env.DB_ADMIN_USER || "postgres";
let adminPass = process.env.DB_ADMIN_PASSWORD;

function askPassword() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("รหัสผ่าน postgres: ", (ans) => {
      rl.close();
      resolve(ans || null);
    });
  });
}

const sql = readFileSync(join(__dirname, "..", "db", "migrations", "056_grant_talent_offers_bids_meera.sql"), "utf8");

(async () => {
  try {
    if (!adminPass) {
      console.log("ไม่พบ DB_ADMIN_PASSWORD ใน .env — กรุณาใส่รหัสผ่าน postgres:");
      adminPass = await askPassword();
      if (!adminPass) {
        console.log("ยกเลิก");
        process.exit(1);
      }
    }
    const pool = new pg.Pool({
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432", 10),
      database: process.env.DB_DATABASE || "meera_db",
      user: adminUser,
      password: adminPass,
    });
    console.log("Running GRANT as", adminUser, "...");
    await pool.query(sql);
    await pool.end();
    console.log("✅ Done. Restart backend และลอง GET /api/bids/offers/open/:talentId ใหม่");
  } catch (err) {
    console.error("Failed:", err.message);
    console.log("\nหรือรันด้วย psql:");
    console.log("  psql -U postgres -d meera_db -f backend/db/migrations/056_grant_talent_offers_bids_meera.sql");
    process.exit(1);
  }
})();
