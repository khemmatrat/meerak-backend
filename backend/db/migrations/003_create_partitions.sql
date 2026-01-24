-- Sample data for testing
INSERT INTO users (firebase_uid, email, phone, full_name, kyc_status, kyc_level, wallet_balance) VALUES
('firebase_uid_1', 'user1@example.com', '0811111111', 'สมชาย ใจดี', 'ai_verified', 'level_2', 15000.50),
('firebase_uid_2', 'user2@example.com', '0822222222', 'สมหญิง เก่งมาก', 'pending', 'level_1', 5000.00),
('firebase_uid_3', 'admin@example.com', '0833333333', 'แอดมิน ระบบ', 'verified', 'level_3', 100000.00);

-- Sample transactions
INSERT INTO transactions (transaction_id, user_id, type, amount, status, payment_method, completed_at)
SELECT 
    uuid_generate_v4(),
    u.id,
    CASE WHEN RANDOM() < 0.5 THEN 'deposit' ELSE 'payment' END,
    (RANDOM() * 10000 + 100)::DECIMAL(12,2),
    'completed',
    CASE 
        WHEN RANDOM() < 0.3 THEN 'promptpay'
        WHEN RANDOM() < 0.6 THEN 'credit_card'
        ELSE 'bank_transfer'
    END,
    NOW() - (RANDOM() * INTERVAL '30 days')
FROM users u
CROSS JOIN generate_series(1, 10);