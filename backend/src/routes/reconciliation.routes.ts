/**
 * Reconciliation routes. POST /run and upload require ADMIN role.
 */
import express from "express";
import { reconciliationController } from "../controllers/reconciliation.controller";
import { authenticate, requireRole } from "../middleware/auth";

const router = express.Router();
router.post(
  "/run",
  authenticate,
  requireRole(["ADMIN"]),
  reconciliationController.run.bind(reconciliationController),
);
export default router;
