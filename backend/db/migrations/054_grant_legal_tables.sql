-- =================================================================================
-- 054: Grant permissions for Legal/Compliance tables
-- แก้ไข "permission denied for table account_deletion_requests"
--
-- หมายเหตุ: Migration นี้ต้องรันด้วย postgres (superuser) ครั้งเดียวเท่านั้น
-- เพราะตารางอาจถูกสร้างโดย postgres ทำให้ meera ไม่มีสิทธิ์
--
-- รัน: psql -U postgres -d meera_db -f backend/db/migrations/054_grant_legal_tables.sql
--
-- หลังจากนั้น: ใช้ meera ตัวเดียวสำหรับ migration และ backend (ดู .env DB_USER=meera)
-- =================================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON account_deletion_requests TO meera;
GRANT SELECT, INSERT, UPDATE, DELETE ON pdpa_data_export_requests TO meera;
GRANT SELECT, INSERT, UPDATE, DELETE ON law_enforcement_requests TO meera;
