-- Admin job-operations/queue-backlog และ schema เดิม (001) คาดว่ามี subcategory
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100);
