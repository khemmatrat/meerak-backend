-- ข้อมูลตัวอย่างสำหรับ testing (use distinct phone numbers - 003 already uses 0811111111, 0822222222, 0833333333)
INSERT INTO users (firebase_uid, email, phone, full_name, kyc_status, kyc_level, wallet_balance) VALUES
('test_user_1', 'user1@test.com', '0844444444', 'ทดสอบ ผู้ใช้หนึ่ง', 'ai_verified', 'level_2', 5000.00),
('test_user_2', 'user2@test.com', '0855555555', 'ทดสอบ ผู้ใช้สอง', 'pending', 'level_1', 1000.00);