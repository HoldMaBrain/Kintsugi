-- Migration: Add original_response column to reviews table
-- Run this in your Supabase SQL Editor if the column doesn't exist

ALTER TABLE reviews 
ADD COLUMN IF NOT EXISTS original_response TEXT;
