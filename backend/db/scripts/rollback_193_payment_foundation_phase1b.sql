-- =============================================================================
-- Rollback helper for migration 193 (run manually against same DB/user as app)
-- Order respects FK dependencies. Safe when application code does not rely on these tables.
-- =============================================================================

ALTER TABLE IF EXISTS payments DROP CONSTRAINT IF EXISTS fk_payments_active_attempt;

DROP TRIGGER IF EXISTS trg_payment_status_transitions_no_update ON payment_status_transitions;
DROP TRIGGER IF EXISTS trg_payment_status_transitions_no_delete ON payment_status_transitions;
DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;

DROP FUNCTION IF EXISTS payment_status_transitions_append_only();
DROP FUNCTION IF EXISTS payments_set_updated_at();

DROP TABLE IF EXISTS payment_webhook_events;
DROP TABLE IF EXISTS payment_status_transitions;
DROP TABLE IF EXISTS payment_attempts;
DROP TABLE IF EXISTS payments;
