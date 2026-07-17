-- Sprint S1: merchant packing proof for food orders (Track OS + claim evidence)

CREATE TABLE IF NOT EXISTS commerce.order_packing_proofs (
  order_id TEXT PRIMARY KEY REFERENCES commerce.orders(id) ON DELETE CASCADE,
  merchant_id TEXT NOT NULL,
  photo_url TEXT NOT NULL,
  storage TEXT NOT NULL DEFAULT 'local' CHECK (storage IN ('local', 'minio')),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_order_packing_proofs_merchant
  ON commerce.order_packing_proofs (merchant_id, uploaded_at DESC);
