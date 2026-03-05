-- =================================================================================
-- 067: Debt Balance (Allow Negative) + BOOKING_HOLD
-- =================================================================================
-- Phase 3: Operational Logic
-- 1. Allow wallet_balance to go negative (debt) for penalty/repayment
-- 2. Add BOOKING_HOLD status for pre-payment escrow
-- =================================================================================

-- 1. Remove non-negative constraint on wallet_balance (allow debt)
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_wallet_balance_non_negative;
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_wallet_pending_non_negative;

-- Drop trigger that blocks negative balance
DROP TRIGGER IF EXISTS prevent_negative_wallet_balance ON users;

-- Re-add only for wallet_pending (pending must stay >= 0)
ALTER TABLE users ADD CONSTRAINT check_wallet_pending_non_negative
  CHECK (COALESCE(wallet_pending, 0) >= 0);

COMMENT ON COLUMN users.wallet_balance IS 'Can go negative (debt) when penalty exceeds balance; repaid by future earnings';

-- 2. Add booking_hold to deposit_status enum (for 100% pre-payment escrow)
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_deposit_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_deposit_status_check
  CHECK (deposit_status IN ('none', 'pending', 'held', 'released', 'refunded', 'booking_hold'));

COMMENT ON COLUMN bookings.deposit_status IS 'booking_hold=100% pre-pay escrow until job marked done; held=partial deposit';
