/**
 * ตั้งค่า DB ให้ใช้ meera ตัวเดียวตั้งแต่ต้น (รันครั้งเดียวตอน setup โปรเจกต์ใหม่)
 *
 * สิ่งที่ทำ:
 * 1. สร้าง user meera ถ้ายังไม่มี
 * 2. สร้าง database meera_db ถ้ายังไม่มี
 * 3. GRANT สิทธิ์ให้ meera
 *
 * ต้องรันด้วย postgres (ครั้งเดียว): node backend/scripts/setup-db-meera.js
 * ใส่ใน .env: DB_ADMIN_USER=postgres, DB_ADMIN_PASSWORD=รหัส_postgres
 *
 * หลังจากนั้น: ใช้ meera ตัวเดียว (DB_USER=meera, DB_PASSWORD=meera123)
 */
import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", "..", ".env") });

const adminUser = process.env.DB_ADMIN_USER || "postgres";
const adminPass = process.env.DB_ADMIN_PASSWORD;
const dbName = process.env.DB_DATABASE || "meera_db";
const meeraPass = process.env.DB_PASSWORD || "meera123";

async function run() {
  if (!adminPass) {
    console.log("ใส่ DB_ADMIN_PASSWORD ใน .env (รหัส postgres) — ใช้ครั้งเดียวตอน setup");
    process.exit(1);
  }

  const pool = new pg.Pool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: "postgres",
    user: adminUser,
    password: adminPass,
  });

  try {
    console.log("Setting up meera as single DB user...");

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'meera') THEN
          CREATE ROLE meera WITH LOGIN PASSWORD '${meeraPass.replace(/'/g, "''")}';
          RAISE NOTICE 'Created user meera';
        END IF;
      END $$;
    `);

    await pool.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]).then(async (r) => {
      if (!r.rows?.length) {
        await pool.query(`CREATE DATABASE ${dbName} OWNER meera`);
        console.log("Created database", dbName);
      }
    });

    await pool.end();

    const pool2 = new pg.Pool({
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432", 10),
      database: dbName,
      user: adminUser,
      password: adminPass,
    });

    await pool2.query(`GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO meera`);
    await pool2.query(`GRANT ALL ON SCHEMA public TO meera`);
    await pool2.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO meera`);

    const tables = ["account_deletion_requests", "pdpa_data_export_requests", "law_enforcement_requests"];
    for (const t of tables) {
      try {
        await pool2.query(`GRANT ALL ON TABLE ${t} TO meera`);
        console.log("Granted", t);
      } catch (_) {}
    }

    await pool2.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO meera`);
    await pool2.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO meera`);

    await pool2.end();
    console.log("Done. ใช้ meera ตัวเดียวได้แล้ว — ลบ DB_ADMIN_PASSWORD ออกจาก .env ได้");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

run();
