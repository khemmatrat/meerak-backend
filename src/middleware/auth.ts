/**
 * Authentication & Authorization middleware.
 * - JWT required for all /api/wallet, /api/reconciliation, /api/admin routes when JWT_SECRET is set.
 * - user_id MUST come from verified JWT (req.user.id); body/query user_id is ignored for money APIs.
 */
import { Request, Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";

export type AppRole = "USER" | "ADMIN" | "AUDITOR";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: AppRole; email?: string };
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET;
const NODE_ENV = process.env.NODE_ENV || "development";

/**
 * Verify JWT from Authorization: Bearer <token>.
 * Payload must contain: sub (user id). Optional: role ('USER'|'ADMIN'|'AUDITOR'), email.
 * Sets req.user = { id: sub, role: role || 'USER', email }.
 * Returns 401 if token missing or invalid (when JWT_SECRET is set).
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!JWT_SECRET) {
    if (NODE_ENV === "development") {
      req.user = { id: "dev-user-id", role: "USER" };
      next();
      return;
    }
    res.status(503).json({ error: "JWT not configured; set JWT_SECRET" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res
      .status(401)
      .json({
        error:
          "Missing or invalid Authorization header (Bearer token required)",
      });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      role?: AppRole;
      email?: string;
    };
    const sub = payload.sub;
    if (!sub) {
      res.status(401).json({ error: "Invalid token: missing sub" });
      return;
    }
    const role: AppRole = ["USER", "ADMIN", "AUDITOR"].includes(
      payload.role as string,
    )
      ? (payload.role as AppRole)
      : "USER";
    req.user = { id: sub, role, email: payload.email };
    next();
  } catch (e) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Require at least one of the given roles. Call after authenticate().
 * Returns 403 if req.user.role is not in allowedRoles.
 */
export function requireRole(allowedRoles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res
        .status(403)
        .json({
          error:
            "Insufficient permissions; required role: " +
            allowedRoles.join(" or "),
        });
      return;
    }
    next();
  };
}

/** Admin-only: authenticate then require ADMIN role. Used by existing admin.routes. */
export function authenticateAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  authenticate(req, res, () => {
    requireRole(["ADMIN"])(req, res, next);
  });
}
