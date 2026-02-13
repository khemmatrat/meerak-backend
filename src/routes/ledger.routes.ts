/**
 * Ledger routes - Append-only payment ledger (audit & reconciliation).
 * POST /api/ledger/append only. No GET/PUT/DELETE for writing.
 */
import express from "express";
import { ledgerController } from "../controllers/ledger.controller";

const router = express.Router();

router.post("/append", ledgerController.append);

export default router;
