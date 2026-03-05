-- =================================================================================
-- 044: Grant permissions for talent_offers and bids
-- =================================================================================
-- แก้ไข permission denied for table talent_offers
-- รัน: psql -U postgres -d meera_db -f 044_grant_talent_offers_bids.sql
-- หรือเปลี่ยน postgres เป็น DB_USER ที่ใช้ใน .env
-- =================================================================================

GRANT ALL ON talent_offers TO meera;
GRANT ALL ON bids TO meera;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO meera;
