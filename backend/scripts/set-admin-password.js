/**
 * Set or reset admin password + บทบาท user_roles เป็น SUPER_ADMIN (แผง Nexus Admin)
 *
 * จาก backend:
 *   node scripts/set-admin-password.js [รหัสผ่านใหม่]
 *   node scripts/set-admin-password.js admin@example.com รหัสผ่านใหม่
 *
 * แค่เลื่อนเป็น SUPER_ADMIN โดยไม่แตะรหัส (ผู้ใช้ต้องมีใน users อยู่แล้ว):
 *   node scripts/set-admin-password.js --promote-only admin@example.com
 *
 * ถ้าไม่ใส่อีเมลในอาร์กิวเมนต์ ใช้ ADMIN_EMAIL จาก .env หรือค่าเริ่มต้น admin@nexus.com
 *
 * โหลด .env: backend/.env ก่อน แล้ว root .env ทับ (เหมือน run-migration.js)
 */
import dotenv from "dotenv";
import pg from "pg";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, "..");
const rootDir = join(backendDir, "..");

dotenv.config({ path: join(backendDir, ".env") });
dotenv.config({ path: join(rootDir, ".env") });

const argv = process.argv.slice(2);
const promoteOnly = argv.includes("--promote-only");
const args = argv.filter((a) => a !== "--promote-only");

const defaultEmail = (process.env.ADMIN_EMAIL || "admin@nexus.com").trim().toLowerCase();

function parseArgs() {
  if (promoteOnly) {
    const emailArg = args.find((a) => String(a).includes("@"));
    if (!emailArg) {
      console.error("Usage: node scripts/set-admin-password.js --promote-only <email>");
      process.exit(1);
    }
    return { email: emailArg.trim().toLowerCase(), password: null, promoteOnly: true };
  }
  const a0 = args[0];
  const a1 = args[1];
  if (a0 && String(a0).includes("@")) {
    return {
      email: String(a0).trim().toLowerCase(),
      password: a1 != null && String(a1).length > 0 ? String(a1) : "admin123",
      promoteOnly: false,
    };
  }
  return {
    email: defaultEmail,
    password: a0 != null && String(a0).length > 0 ? String(a0) : "admin123",
    promoteOnly: false,
  };
}

const { email: ADMIN_EMAIL, password: newPassword, promoteOnly: isPromoteOnly } = parseArgs();

async function main() {
  const pool = new pg.Pool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_DATABASE || "meera_db",
    user: process.env.DB_USER || "meera",
    password: process.env.DB_PASSWORD || "meera123",
  });

  try {
    const existing = await pool.query("SELECT id FROM users WHERE LOWER(TRIM(email)) = $1", [
      ADMIN_EMAIL,
    ]);

    if (existing.rows.length === 0) {
      if (isPromoteOnly) {
        console.error("❌ No user with email:", ADMIN_EMAIL);
        process.exit(1);
      }
      console.error("❌ No user with email:", ADMIN_EMAIL, "— create the user first or fix the email.");
      process.exit(1);
    }

    const userId = existing.rows[0].id;

    if (!isPromoteOnly) {
      const hash = await bcrypt.hash(newPassword, 10);
      await pool.query(
        "UPDATE users SET password_hash = $1, password = $2, updated_at = NOW() WHERE id = $3",
        [hash, newPassword, userId],
      );
      console.log("✅ Password updated for", ADMIN_EMAIL, "(user id:", userId, ")");
    } else {
      console.log("⏭️  --promote-only: password unchanged for", ADMIN_EMAIL, "(user id:", userId, ")");
    }

    await pool.query(
      `INSERT INTO user_roles (user_id, role, created_at, updated_at)
       VALUES ($1, 'SUPER_ADMIN', NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET role = 'SUPER_ADMIN', updated_at = NOW()`,
      [String(userId)],
    );
    console.log("✅ user_roles set to SUPER_ADMIN");

    console.log("\n📌 Nexus Admin login:");
    console.log("   Email:", ADMIN_EMAIL);
    if (!isPromoteOnly) console.log("   Password:", newPassword);
    console.log("   → Log out of the admin panel in the browser and sign in again to refresh the JWT role.");
  } catch (err) {
    console.error("❌ Error:", err.message);
    if (err.message.includes('relation "user_roles" does not exist')) {
      console.error("   Run migration: node scripts/run-migration.js 010");
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
