-- 038: Add decision_power_percent to investors (สัดส่วนอำนาจร่วมตัดสินใจ)
-- และสร้าง system_settings ถ้ายังไม่มี (สำหรับ market_cap)
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE investors
  ADD COLUMN IF NOT EXISTS decision_power_percent NUMERIC(5,2) DEFAULT 0 CHECK (decision_power_percent >= 0 AND decision_power_percent <= 100);
