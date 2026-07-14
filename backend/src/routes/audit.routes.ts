/**
 * Audit routes: read-only for AUDITOR and ADMIN. No mutation.
 */
import express from "express";
import { auditController } from "../controllers/audit.controller";
import { authenticate, requireRole } from "../middleware/auth";

const router = express.Router();
router.get(
  "/ledger",
  authenticate,
  requireRole(["AUDITOR", "ADMIN"]),
  auditController.ledger.bind(auditController),
);
router.get(
  "/reconciliation",
  authenticate,
  requireRole(["AUDITOR", "ADMIN"]),
  auditController.reconciliation.bind(auditController),
);
router.get(
  "/logs",
  authenticate,
  requireRole(["AUDITOR", "ADMIN"]),
  auditController.logs.bind(auditController),
);
export default router;
