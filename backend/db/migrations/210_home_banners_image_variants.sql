-- =================================================================================
-- 210: Home banners — multi-aspect image variants (image_variants)
-- =================================================================================

ALTER TABLE home_banners
  ADD COLUMN IF NOT EXISTS image_variants JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN home_banners.image_variants IS 'Optional image URLs by aspect ratio (e.g. {"1:1": "...", "9:16": "..."}) for art-direction.';

