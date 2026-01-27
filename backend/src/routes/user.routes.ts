// backend/src/routes/user.routes.ts
import { Router } from "express";
import { authenticate, optionalAuthenticate } from "../middleware/auth";
import { userController } from "../controllers/user.controller";

const router = Router();

// Profile routes
router.get("/profile/:id", optionalAuthenticate, userController.getProfile);
router.get("/profile", authenticate, userController.getMyProfile);
router.patch("/profile", authenticate, userController.updateProfile);

// Wallet routes
router.get("/wallet/summary", authenticate, userController.getWalletSummary);
router.post("/wallet/deposit", authenticate, userController.deposit);
router.post("/wallet/withdraw", authenticate, userController.withdraw);
router.get("/wallet/transactions", authenticate, userController.getTransactions);

// Skills routes
router.get("/skills", authenticate, userController.getSkills);
router.post("/skills", authenticate, userController.addSkill);
router.put("/skills/:skillId", authenticate, userController.updateSkill);
router.delete("/skills/:skillId", authenticate, userController.removeSkill);

// Certifications routes
router.get("/certifications", authenticate, userController.getCertifications);
router.post("/certifications", authenticate, userController.addCertification);
router.delete("/certifications/:certificationId", authenticate, userController.removeCertification);

export default router;
