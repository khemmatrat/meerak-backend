/**
 * รัน GRANT ให้ meera เข้าถึงตาราง legal/compliance (ครั้งเดียว)
 * แก้ "permission denied for table account_deletion_requests"
 *
 * โปรเจกต์ควรใช้ meera ตัวเดียวตั้งแต่ต้น — ปัญหานี้เกิดเมื่อตารางถูกสร้างโดย postgres
 *
 * วิธีที่ 1: ใส่ใน .env แล้วรัน
 *   DB_ADMIN_USER=postgres
 *   DB_ADMIN_PASSWORD=รหัสผ่าน_postgres
 *
 * วิธีที่ 2: psql -U postgres -d meera_db -f backend/db/migrations/054_grant_legal_tables.sql
 *
 * รัน: node backend/scripts/grant-legal-permissions.js
 */
import pg from "pg";
import readline from "readline";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", "..", ".env") });

// ลอง meera ก่อน (ถ้าตารางเป็นของ meera อยู่แล้ว ไม่ต้อง GRANT)
const tryMeeraFirst = !process.env.DB_ADMIN_USER && !process.env.DB_ADMIN_PASSWORD;
const adminUser = process.env.DB_ADMIN_USER || (tryMeeraFirst ? "meera" : "postgres");
let adminPass = process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD;

function askPassword() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("รหัสผ่าน postgres: ", (ans) => {
      rl.close();
      resolve(ans || null);
    });
  });
}

const sql = readFileSync(join(__dirname, "..", "db", "migrations", "054_grant_legal_tables.sql"), "utf8");

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
    console.log("Done. Restart backend และลองใหม่");
  } catch (err) {
    console.error("Failed:", err.message);
    if (err.message?.includes("password authentication failed")) {
      console.log("\nรหัสผ่าน postgres ไม่ถูกต้อง");
    }
    if (err.message?.includes("permission denied")) {
      console.log("\nต้องรันด้วย postgres (superuser)");
    }
    console.log("\nหรือรันด้วย psql:");
    console.log("  psql -U postgres -d meera_db -f backend/db/migrations/054_grant_legal_tables.sql");
    process.exit(1);
  }
})();
