-- =================================================================================
-- 063: แก้ไข compliance_policies_type_check ให้รองรับทุก type ที่มีในระบบ
-- แก้ปัญหา "check constraint is violated by some row" เมื่อรัน migration 045-052
--
-- วิธีใช้: รัน migration นี้ก่อน 045, 046, 047, 049, 051, 052
-- =================================================================================

-- 1. แก้แถวที่มี type ไม่อยู่ในรายการที่อนุญาต (ใช้ terms + version เฉพาะเพื่อหลีกเลี่ยง UNIQUE)
WITH allowed AS (
  SELECT unnest(ARRAY[
    'terms','privacy','cookie','refund','community_guidelines',
    'kyc_policy','escrow_policy','talent_policy','night_work_policy',
    'prohibited_services','platform_enforcement',
    'anti_fraud','dispute','enforcement','freelancer_agreement','client_agreement','content_chat',
    'talent_category_rules','off_platform_transaction','escrow_legal_clause','liability_limitation',
    'aml_policy','risk_monitoring_policy','trust_safety_manual','managed_marketplace_policy',
    'high_risk_services_policy','safety_incident_policy'
  ]) AS t
),
invalid AS (
  SELECT id, type, version, ROW_NUMBER() OVER () AS rn
  FROM compliance_policies
  WHERE type IS NULL OR TRIM(type) = '' OR type NOT IN (SELECT t FROM allowed)
)
UPDATE compliance_policies p
SET type = 'terms', version = '0.legacy' || v.rn::text, notes = COALESCE(p.notes,'') || ' [063:fixed]'
FROM invalid v WHERE p.id = v.id;

-- 2. ลบ constraint เดิม (ถ้ามี)
ALTER TABLE compliance_policies DROP CONSTRAINT IF EXISTS compliance_policies_type_check;

-- 3. เพิ่ม constraint ใหม่
ALTER TABLE compliance_policies ADD CONSTRAINT compliance_policies_type_check CHECK (type IN (
  'terms', 'privacy', 'cookie', 'refund', 'community_guidelines',
  'kyc_policy', 'escrow_policy', 'talent_policy', 'night_work_policy',
  'prohibited_services', 'platform_enforcement',
  'anti_fraud', 'dispute', 'enforcement', 'freelancer_agreement', 'client_agreement', 'content_chat',
  'talent_category_rules', 'off_platform_transaction', 'escrow_legal_clause', 'liability_limitation',
  'aml_policy', 'risk_monitoring_policy', 'trust_safety_manual', 'managed_marketplace_policy',
  'high_risk_services_policy', 'safety_incident_policy'
));
