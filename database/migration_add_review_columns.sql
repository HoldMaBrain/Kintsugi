ALTER TABLE reviews 
ADD COLUMN IF NOT EXISTS original_response TEXT;
