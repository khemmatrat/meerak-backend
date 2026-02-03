/**
 * Phase 4C: Financial Dashboard — read-only. ADMIN or AUDITOR.
 */
import express from "express";
import { adminFinancialController } from "../controllers/admin.financial.controller";
import { authenticate, requireRole } from "../middleware/auth";

const router = express.Router();

router.use(authenticate);
router.use(requireRole(["ADMIN", "AUDITOR"]));

router.get(
  "/dashboard",
  adminFinancialController.dashboard.bind(adminFinancialController),
);

export default router;
