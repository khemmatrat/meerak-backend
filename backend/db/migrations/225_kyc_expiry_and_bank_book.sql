-- วันหมดอายุบัตร + แท็กสาเหตุสั่งกรอกใหม่ + ขยาย bank_accounts (bank_book_url ใน JSON ไม่ต้อง ALTER)

ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS id_card_expiry_date DATE;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS driver_license_expiry DATE;

ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_resubmit_trigger VARCHAR(32);
