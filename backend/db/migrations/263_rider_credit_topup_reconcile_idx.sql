-- Speed up overnight / batch reconcile of pending Rider OS PromptPay topups
CREATE INDEX IF NOT EXISTS idx_rider_credit_topup_charges_pending_pp
  ON rider_credit_topup_charges (created_at ASC)
  WHERE LOWER(COALESCE(status, 'pending')) = 'pending'
    AND LOWER(COALESCE(payment_method, 'promptpay')) = 'promptpay';

COMMENT ON INDEX idx_rider_credit_topup_charges_pending_pp IS
  'Pending PromptPay rider credit topups — batch reconcile cron';
