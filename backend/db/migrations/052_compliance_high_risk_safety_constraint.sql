-- =================================================================================
-- 052: แก้ไข constraint ให้รองรับ high_risk_services_policy และ safety_incident_policy
-- แก้ปัญหา "บันทึกไม่ได้" สำหรับ High-Risk Services Policy และ Safety Incident Policy
-- =================================================================================

ALTER TABLE compliance_policies DROP CONSTRAINT IF EXISTS compliance_policies_type_check;
ALTER TABLE compliance_policies ADD CONSTRAINT compliance_policies_type_check CHECK (type IN (
  'terms', 'privacy', 'cookie', 'refund', 'community_guidelines',
  'kyc_policy', 'escrow_policy', 'talent_policy', 'night_work_policy',
  'prohibited_services', 'platform_enforcement',
  'anti_fraud', 'dispute', 'enforcement', 'freelancer_agreement', 'client_agreement', 'content_chat',
  'talent_category_rules', 'off_platform_transaction', 'escrow_legal_clause', 'liability_limitation',
  'aml_policy', 'risk_monitoring_policy', 'trust_safety_manual', 'managed_marketplace_policy',
  'high_risk_services_policy', 'safety_incident_policy'
));
