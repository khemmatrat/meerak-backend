-- P6: Order fulfillment + 48h SLA → escrow REFUND
-- Run against `bagisto` database

ALTER TABLE marketplace.orders
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'pending_ship'
    CHECK (fulfillment_status IN ('pending_ship', 'shipped', 'delivered', 'sla_breach')),
  ADD COLUMN IF NOT EXISTS carrier_code TEXT,
  ADD COLUMN IF NOT EXISTS tracking_id TEXT,
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_hours INT NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS sla_metadata JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_orders_fulfillment ON marketplace.orders (fulfillment_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_orders_sla_deadline ON marketplace.orders (sla_deadline_at)
  WHERE fulfillment_status = 'shipped';

COMMENT ON COLUMN marketplace.orders.fulfillment_status IS 'P6: pending_ship → shipped → delivered | sla_breach';
COMMENT ON COLUMN marketplace.orders.sla_deadline_at IS 'P6: shipped_at + sla_hours — n8n checks breach after deadline';
