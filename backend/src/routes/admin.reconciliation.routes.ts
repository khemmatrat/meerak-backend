/**
 * Admin reconciliation routes. All require ADMIN role.
 */
import express from "express";
import { adminReconciliationController } from "../controllers/admin.reconciliation.controller";
import { authenticate, requireRole } from "../middleware/auth";

const router = express.Router();
router.post(
  "/upload",
  authenticate,
  requireRole(["ADMIN"]),
  adminReconciliationController.upload.bind(adminReconciliationController),
);
export default router;
