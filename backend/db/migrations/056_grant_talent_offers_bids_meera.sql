-- =================================================================================
-- 056: Grant meera permissions on talent_offers and bids
-- แก้ไข 500 error: GET /api/bids/offers/open/:talentId (permission denied)
--
-- ต้องรันด้วย postgres (superuser) ครั้งเดียว
-- รัน: psql -U postgres -d meera_db -f backend/db/migrations/056_grant_talent_offers_bids_meera.sql
-- หรือ: node backend/scripts/grant-talent-offers-permissions.js
-- =================================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON talent_offers TO meera;
GRANT SELECT, INSERT, UPDATE, DELETE ON bids TO meera;
