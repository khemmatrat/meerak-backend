-- 159: Zero-reserve liquidity — wallet_balance_withdrawable, PaySo settlement flags on wallet_transactions
-- =============================================================================

-- 1. users.wallet_balance_withdrawable — subset of wallet_balance eligible for payout (manual + released PaySo + other earned)
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance_withdrawable NUMERIC(18, 2);

UPDATE users
SET wallet_balance_withdrawable = COALESCE(wallet_balance, 0)
WHERE wallet_balance_withdrawable IS NULL;

ALTER TABLE users ALTER COLUMN wallet_balance_withdrawable SET DEFAULT 0;
ALTER TABLE users ALTER COLUMN wallet_balance_withdrawable SET NOT NULL;

COMMENT ON COLUMN users.wallet_balance_withdrawable IS 'ยอดที่ถอนได้ (ไม่รวม PaySo ที่ยังไม่ปล่อยรอบพุธ) — เทียบกับ wallet_balance';

-- 2. wallet_transactions — per-row withdrawable + settlement UX
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS is_withdrawable BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS available_on DATE;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS net_amount_thb NUMERIC(18, 2);

COMMENT ON COLUMN wallet_transactions.is_withdrawable IS 'PaySo ก่อนปล่อยรอบพุธ = false; manual / หลังปล่อย = true';
COMMENT ON COLUMN wallet_transactions.available_on IS 'วันที่คาดว่าถอนได้ (PaySo: พฤหัสถัดไป — อ้างอิง)';
COMMENT ON COLUMN wallet_transactions.net_amount_thb IS 'net เข้าวอลเล็ต (หลังหัก fee) สำหรับปล่อย withdrawable';

-- 3. Backfill net_amount + flags from ledger
UPDATE wallet_transactions wt
SET net_amount_thb = COALESCE(pla.net_amount, pla.amount, 0)
FROM payment_ledger_audit pla
WHERE pla.id = wt.ledger_id
  AND wt.net_amount_thb IS NULL;

UPDATE wallet_transactions
SET is_withdrawable = CASE
  WHEN funding_source = 'PAYSO' AND settlement_status = 'PENDING_SETTLEMENT' THEN false
  ELSE true
END
WHERE funding_source IN ('MANUAL', 'PAYSO');

-- 4. Reconcile users.wallet_balance_withdrawable after flag changes (subtract pending PaySo net from total)
UPDATE users u
SET wallet_balance_withdrawable = GREATEST(
  0,
  COALESCE(u.wallet_balance, 0) - COALESCE(pending.pending_net, 0)
)
FROM (
  SELECT wt.user_id, SUM(COALESCE(wt.net_amount_thb, pla.net_amount, 0)) AS pending_net
  FROM wallet_transactions wt
  LEFT JOIN payment_ledger_audit pla ON pla.id = wt.ledger_id
  WHERE wt.funding_source = 'PAYSO' AND wt.settlement_status = 'PENDING_SETTLEMENT' AND wt.is_withdrawable = false
  GROUP BY wt.user_id
) pending
WHERE u.id = pending.user_id;

-- Users with no pending PaySo rows stay at full balance (already set in step 1)
