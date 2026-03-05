-- 041: Grant SELECT/INSERT/UPDATE on resource-cost tables to app user
-- ใช้ DB_NAME จาก .env เป็น role (server.js ใช้ DB_USER || 'meera')
-- รัน: psql -U postgres -d meera_db -v role=meera -f 041_grant_resource_cost_tables.sql
-- หรือ: cd backend && powershell -File scripts/grant_resource_cost.ps1

GRANT SELECT ON TABLE financial_expenses TO meera;
GRANT SELECT, INSERT, UPDATE ON TABLE system_settings TO meera;
GRANT SELECT ON TABLE payment_ledger_audit TO meera;
