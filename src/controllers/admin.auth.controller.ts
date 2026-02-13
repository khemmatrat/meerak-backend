/**
 * Admin auth: issue JWT for ADMIN/AUDITOR only.
 * Phase 4: Admin dashboard must authenticate via JWT; role comes from user_roles.
 * No admin API is callable without JWT (enforced by middleware).
 */
import { Request, Response } from "express";
import * as jwt from "jsonwebtoken";
import { getPool } from "../store";
import type { AppRole } from "../middleware/auth";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET;
const NODE_ENV = process.env.NODE_ENV || "development";

function verifyPassword(plain: string, storedHash: string | null): boolean {
  if (!storedHash || storedHash.trim() === "") return false;
  try {
    const [saltHex, hashHex] = storedHash.split("$");
    if (!saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, "hex");
    const hash = crypto.pbkdf2Sync(plain, salt, 100000, 64, "sha512");
    return crypto.timingSafeEqual(Buffer.from(hashHex, "hex"), hash);
  } catch {
    return false;
  }
}

function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(32);
  const hash = crypto.pbkdf2Sync(plain, salt, 100000, 64, "sha512");
  return salt.toString("hex") + "$" + hash.toString("hex");
}

export const adminAuthController = {
  /**
   * POST /api/auth/admin-login
   * Body: { email, password }
   * Returns JWT with sub = user id, role = ADMIN | AUDITOR (from user_roles).
   * Only users with role ADMIN or AUDITOR can log in here.
   */
  async adminLogin(req: Request, res: Response): Promise<void> {
    if (!JWT_SECRET) {
      res.status(503).json({ error: "JWT not configured; set JWT_SECRET" });
      return;
    }

    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "email required" });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    try {
      const userResult = await pool.query(
        `SELECT id, email, full_name, password_hash FROM users WHERE email = $1 AND (deleted_at IS NULL OR deleted_at > CURRENT_TIMESTAMP)`,
        [email.trim().toLowerCase()],
      );
      if (userResult.rows.length === 0) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      const user = userResult.rows[0] as {
        id: string;
        email: string;
        full_name: string | null;
        password_hash: string | null;
      };

      const roleResult = await pool.query(
        `SELECT role FROM user_roles WHERE user_id = $1`,
        [user.id],
      );
      const role: AppRole =
        roleResult.rows.length > 0
          ? (roleResult.rows[0].role as AppRole)
          : "USER";

      if (role !== "ADMIN" && role !== "AUDITOR") {
        res.status(403).json({
          error: "Access denied; admin or auditor role required",
        });
        return;
      }

      const hasPassword = user.password_hash && user.password_hash.trim() !== "";
      if (hasPassword) {
        if (!password || typeof password !== "string") {
          res.status(400).json({ error: "password required" });
          return;
        }
        if (!verifyPassword(password, user.password_hash)) {
          res.status(401).json({ error: "Invalid credentials" });
          return;
        }
      } else {
        if (NODE_ENV !== "development") {
          res.status(401).json({
            error: "Admin account has no password set; set password in production",
          });
          return;
        }
        if (!password || String(password).length < 4) {
          res.status(400).json({ error: "password required (min 4 chars in dev)" });
          return;
        }
      }

      const token = jwt.sign(
        {
          sub: user.id,
          role,
          email: user.email,
        },
        JWT_SECRET,
        { expiresIn: "8h" },
      );

      res.json({
        access_token: token,
        token_type: "Bearer",
        expires_in: 8 * 60 * 60,
        user: {
          id: user.id,
          email: user.email,
          name: user.full_name || user.email,
          role,
        },
      });
    } catch (e: any) {
      console.error("Admin login error:", e);
      res.status(500).json({ error: "Login failed" });
    }
  },
};

export { hashPassword };
