/**
 * Phase 4B: Admin KYC Review routes.
 * List/detail: ADMIN or AUDITOR. Approve/reject: ADMIN only; every decision logged in financial_audit_log.
 */
import express from "express";
import { adminKycController } from "../controllers/admin.kyc.controller";
import { authenticate, requireRole } from "../middleware/auth";

const router = express.Router();

router.use(authenticate);
router.use(requireRole(["ADMIN", "AUDITOR"]));

router.get("/", adminKycController.list.bind(adminKycController));
router.get("/:userId", adminKycController.get.bind(adminKycController));

router.post(
  "/:userId/approve",
  (req, res, next) => requireRole(["ADMIN"])(req, res, next),
  adminKycController.approve.bind(adminKycController),
);
router.post(
  "/:userId/reject",
  (req, res, next) => requireRole(["ADMIN"])(req, res, next),
  adminKycController.reject.bind(adminKycController),
);

export default router;
