/**
 * Set Nexus Admin Core login password to admin123.
 * Uses same pbkdf2 hash as backend (admin.auth.controller).
 * Run from project root: node scripts/set-admin-password.js
 */
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { Pool } = pg;

function hashPassword(plain) {
  const salt = crypto.randomBytes(32);
  const hash = crypto.pbkdf2Sync(plain, salt, 100000, 64, "sha512");
  return salt.toString("hex") + "$" + hash.toString("hex");
}

const EMAIL = process.env.ADMIN_EMAIL || "admin@nexus.com";
const PASSWORD = "admin123";

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_DATABASE || process.env.DB_NAME,
    user: process.env.DB_USER || process.env.DB_NAME || "postgres",
    password: process.env.DB_PASSWORD,
  });

  const hashed = hashPassword(PASSWORD);
  console.log("Setting password for", EMAIL, "...");

  const client = await pool.connect();
  try {
    // Ensure users table has password_hash (Phase 4 admin login)
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
    `);

    const r = await client.query(
      "SELECT id, email FROM users WHERE email = $1",
      [EMAIL]
    );

    if (r.rows.length > 0) {
      const userId = r.rows[0].id;
      await client.query(
        "UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [hashed, userId]
      );
      await client.query(
        `INSERT INTO user_roles (user_id, role, updated_at)
         VALUES ($1, 'ADMIN', CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) DO UPDATE SET role = 'ADMIN', updated_at = CURRENT_TIMESTAMP`,
        [String(userId)]
      );
      console.log("✅ Password updated. User id:", userId);
    } else {
      await client.query(
        `INSERT INTO users (firebase_uid, email, full_name, password_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = CURRENT_TIMESTAMP`,
        ["admin-nexus-core", EMAIL, "Admin", hashed]
      );
      const r2 = await client.query("SELECT id FROM users WHERE email = $1", [
        EMAIL,
      ]);
      const userId = r2.rows[0].id;
      await client.query(
        `INSERT INTO user_roles (user_id, role, updated_at)
         VALUES ($1, 'ADMIN', CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) DO UPDATE SET role = 'ADMIN', updated_at = CURRENT_TIMESTAMP`,
        [String(userId)]
      );
      console.log("✅ Admin user created/updated. User id:", userId);
    }

    console.log("\n👉 Login at Nexus Admin Core with:");
    console.log("   Email:", EMAIL);
    console.log("   Password:", PASSWORD);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
