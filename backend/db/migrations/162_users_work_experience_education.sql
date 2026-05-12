-- Provider profile: work experience & education (JSON arrays for hirers before booking)
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_experience JSONB DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS education JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN users.work_experience IS 'Array of {id,title,company,location?,startDate,endDate?,description?}';
COMMENT ON COLUMN users.education IS 'Array of {id,school,degree?,field?,startYear?,endYear?,description?}';
