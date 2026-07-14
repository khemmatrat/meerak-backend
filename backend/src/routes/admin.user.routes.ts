/**
 * Phase 4A: Admin User Management routes.
 * All require JWT; list/detail allow ADMIN or AUDITOR; role change requires ADMIN only.
 */
import express from "express";
import { adminUserController } from "../controllers/admin.user.controller";
import { authenticate, requireRole } from "../middleware/auth";

const router = express.Router();

router.use(authenticate);
router.use(requireRole(["ADMIN", "AUDITOR"]));

router.get("/", adminUserController.list.bind(adminUserController));
router.get("/:id", adminUserController.get.bind(adminUserController));

// Role change: ADMIN only (audit log written in controller)
router.patch(
  "/:id/role",
  (req, res, next) => requireRole(["ADMIN"])(req, res, next),
  adminUserController.updateRole.bind(adminUserController),
);

export default router;
