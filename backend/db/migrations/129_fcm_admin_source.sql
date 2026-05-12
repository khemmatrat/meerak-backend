-- 129: FCM source 'admin' for Marine SOS / No-check-in push
-- Admins register FCM token with source='admin' to receive alerts
-- (source is VARCHAR(20), no constraint — 'admin' is valid)
-- No schema change needed; run POST /api/admin/notifications/register-fcm to register
SELECT 1;
