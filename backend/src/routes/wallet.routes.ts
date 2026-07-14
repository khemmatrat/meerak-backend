/**
 * Wallet routes: top-up, withdraw, balance.
 * Single source of truth = PostgreSQL ledger. Idempotent; double-entry.
 */
import express from "express";
import { walletController } from "../controllers/wallet.controller";
import { authenticate } from "../middleware/auth";

const router = express.Router();

router.post(
  "/topup",
  authenticate,
  walletController.topup.bind(walletController),
);
router.post(
  "/withdraw",
  authenticate,
  walletController.withdraw.bind(walletController),
);
router.get(
  "/balance",
  authenticate,
  walletController.balance.bind(walletController),
);

export default router;
