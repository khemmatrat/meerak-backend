-- หลักฐานสลิปเติมเงิน (PromptPay/บัตร/TrueMoney — ผูก charge_id; โอนธนาคารเก็บใน metadata ของ ledger ตอน POST /wallet/topup)
ALTER TABLE wallet_deposit_charges ADD COLUMN IF NOT EXISTS slip_url TEXT;

COMMENT ON COLUMN wallet_deposit_charges.slip_url IS 'URL สลิปที่ผู้ใช้อัปโหลดหลังชำระ (S3)';
