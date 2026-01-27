ALTER TABLE feedback_memory 
ADD COLUMN IF NOT EXISTS unsafe_response TEXT,
ADD COLUMN IF NOT EXISTS corrected_response TEXT;
