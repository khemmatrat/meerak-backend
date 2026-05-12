-- =============================================================================
-- 192: Escrow released ledger uniqueness (Match job settlement / Task 11)
-- =============================================================================
-- Defense-in-depth: at most one ESCROW_RELEASED business line per payment_id,
-- mirroring ux_ledger_escrow_hold_payment (migration 186).
-- Idempotent release + ON CONFLICT on idempotency_key remains primary.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_escrow_released_payment
  ON ledger_entries (payment_id)
  WHERE payment_id IS NOT NULL
    AND event_type = 'ESCROW_RELEASED';

COMMENT ON INDEX ux_ledger_escrow_released_payment IS
  'At most one ESCROW_RELEASED ledger row per payment_id (idempotent release).';
