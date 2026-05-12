/**
 * Auth routes. Phase 4: admin dashboard login issues JWT (role from user_roles).
 */
import express from "express";
import { adminAuthController } from "../controllers/admin.auth.controller";

const router = express.Router();

router.post(
  "/admin-login",
  adminAuthController.adminLogin.bind(adminAuthController),
);

export default router;
