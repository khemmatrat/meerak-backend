วางรูป QR พร้อมเพย์สำหรับโอนเงิน (เติมเงินแบบ Manual Slip) ที่นี่:

  ชื่อไฟล์: ktb-promptpay-manual-qr.png

แทนที่ไฟล์ตัวอย่างด้วยรูปจริงจากธนาคาร (ความละเอียดเพียงพอให้สแกนได้)
ไฟล์นี้ถูกโหลดในแอปที่หน้า Profile → เติมเงิน → โอนผ่านบัญชีธนาคาร (Manual Slip)

---

Phase M0 — HTTP contract (mobile wallet modal)

1) Preview (fee source-of-truth for UI):
   GET /api/wallet/deposit/preview?amount={THB}&payment_method=promptpay|truemoney|card
   Response: gross_amount, processing_fee, net_to_wallet, gateway_fee, platform_margin, payment_method, tip

2) Create PaySo QR / gateway charge:
   POST /api/wallet/deposit/payso
   Body (same as /api/wallet/deposit): { amount, payment_method, return_uri?, phone_number?, card? }
   Response 201: charge_id, qr_code_url, authorization_uri, status, amount, currency, payment_id, source_type

3) Poll status:
   GET /api/wallet/deposit/status/:chargeId

4) Manual slip queue (unchanged):
   POST /api/wallet/deposit/manual (multipart: file + amount)

หมายเหตุ: POST /api/wallet/deposit ยังมีอยู่และทำหน้าที่เดียวกับ /payso ในเฟสนี้ (alias logic ฝั่ง backend).
