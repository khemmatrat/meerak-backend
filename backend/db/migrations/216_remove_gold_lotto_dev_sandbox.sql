-- =============================================================================
-- 216: Remove Gold Lotto dev sandbox (production deploy)
-- =============================================================================

DELETE FROM aqond_gold_lotto_winners WHERE campaign_id = 'gold-dev-sandbox';
DELETE FROM aqond_gold_lotto_draw_runs WHERE campaign_id = 'gold-dev-sandbox';
DELETE FROM aqond_gold_lotto_tickets WHERE campaign_id = 'gold-dev-sandbox';
DELETE FROM aqond_gold_lotto_campaigns WHERE id = 'gold-dev-sandbox';

-- คืนแคมเปญจริงเป็น draft ถ้า publish ทดสอบโดยไม่มีสลาก/ผู้ชนะ
UPDATE aqond_gold_lotto_campaigns
SET status = 'draft',
    frozen_at = NULL,
    drawn_at = NULL,
    published_at = NULL,
    updated_at = NOW()
WHERE id = 'gold-2026'
  AND status IN ('published', 'drawn', 'frozen')
  AND ticket_count_employer = 0
  AND ticket_count_provider = 0
  AND NOT EXISTS (
    SELECT 1 FROM aqond_gold_lotto_winners w WHERE w.campaign_id = 'gold-2026'
  );

UPDATE payout_config
SET value_json = jsonb_set(
  COALESCE(value_json, '{}'::jsonb),
  '{public_results_enabled}',
  'false'::jsonb,
  true
),
updated_at = NOW()
WHERE key = 'gold_lotto_campaign'
  AND EXISTS (
    SELECT 1 FROM aqond_gold_lotto_campaigns c
    WHERE c.id = 'gold-2026'
      AND c.status = 'draft'
      AND c.ticket_count_employer = 0
      AND c.ticket_count_provider = 0
  );
