-- Migration: Add unsafe_response and corrected_response columns to feedback_memory
-- Run this in your Supabase SQL Editor if the columns don't exist

ALTER TABLE feedback_memory 
ADD COLUMN IF NOT EXISTS unsafe_response TEXT,
ADD COLUMN IF NOT EXISTS corrected_response TEXT;
