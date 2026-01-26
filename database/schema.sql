-- Kintsugi Database Schema
-- Run this in your Supabase SQL Editor

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  delete_after TIMESTAMP
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender TEXT CHECK (sender IN ('user', 'ai')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  risk_level TEXT DEFAULT 'info' CHECK (risk_level IN ('info', 'low', 'medium', 'high')),
  flagged BOOLEAN DEFAULT FALSE,
  finalized BOOLEAN DEFAULT FALSE
);

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES users(id),
  verdict TEXT CHECK (verdict IN ('safe', 'unsafe')),
  feedback TEXT,
  corrected_response TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Feedback memory table
CREATE TABLE IF NOT EXISTS feedback_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_type TEXT,
  pattern TEXT,
  human_feedback TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_flagged ON messages(flagged) WHERE flagged = TRUE;
CREATE INDEX IF NOT EXISTS idx_reviews_message_id ON reviews(message_id);
CREATE INDEX IF NOT EXISTS idx_reviews_admin_id ON reviews(admin_id);

-- Enable Row Level Security (adjust policies as needed for your use case)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_memory ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (adjust based on your security requirements)
-- Allow service role to do everything (for backend API)
-- For production, you may want more restrictive policies

-- Drop existing policies if they exist (for re-running this script)
DROP POLICY IF EXISTS "Service role can manage users" ON users;
DROP POLICY IF EXISTS "Users can view own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can view own messages" ON messages;
DROP POLICY IF EXISTS "Admins can manage reviews" ON reviews;
DROP POLICY IF EXISTS "Service role can manage feedback" ON feedback_memory;

-- Users: Allow service role full access
CREATE POLICY "Service role can manage users"
  ON users FOR ALL
  USING (auth.role() = 'service_role');

-- Conversations: Users can only see their own conversations
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (auth.uid()::text = user_id::text OR auth.role() = 'service_role');

-- Messages: Users can only see messages in their conversations
CREATE POLICY "Users can view own messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = messages.conversation_id 
      AND conversations.user_id::text = auth.uid()::text
    ) OR auth.role() = 'service_role'
  );

-- Reviews: Only admins and service role can access
CREATE POLICY "Admins can manage reviews"
  ON reviews FOR ALL
  USING (auth.role() = 'service_role');

-- Feedback memory: Service role only
CREATE POLICY "Service role can manage feedback"
  ON feedback_memory FOR ALL
  USING (auth.role() = 'service_role');
