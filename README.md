# Kintsugi - Human-in-the-Loop Virtual Therapist Safety Monitor

> The art of repairing broken pottery with gold

Kintsugi is a safety-monitored AI mental health support application that uses human-in-the-loop anomaly detection to ensure safe and empathetic interactions.

## Features

- 🤖 **Empathetic AI Chat Interface** - Powered by Google Gemini 2.5 Flash
- 🛡️ **Safety Monitoring Pipeline** - Multi-layer safety detection system
- 👥 **Human Reviewer Dashboard** - Admin interface for reviewing flagged responses
- 🔄 **Feedback Loop** - Continuous improvement through human feedback
- 🎨 **Beautiful UI** - Kintsugi-themed design with gold accents

## Tech Stack

### Frontend
- React 18 with Vite
- Tailwind CSS
- shadcn/ui components
- Framer Motion for animations
- Supabase Auth (Google OAuth)

### Backend
- Node.js with Express
- Google Gemini 2.5 Flash (Chatbot + Safety Critic)
- Supabase PostgreSQL
- REST API

## Setup Instructions

### Prerequisites
- Node.js 18+ installed
- Supabase account and project
- Google Cloud account with Gemini API access

### 1. Install Dependencies

```bash
npm run install:all
```

### 2. Configure Backend

1. Copy `backend/.env.example` to `backend/.env`
2. Fill in your configuration:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GEMINI_CHATBOT_API_KEY=your_gemini_chatbot_api_key
GEMINI_CRITIC_API_KEY=your_gemini_critic_api_key
PORT=3001
ADMIN_EMAILS=admin@example.com
```

### 3. Configure Frontend

1. Copy `frontend/.env.example` to `frontend/.env`
2. Fill in your Supabase credentials:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Set Up Supabase Database

Run the following SQL in your Supabase SQL editor:

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  delete_after TIMESTAMP
);

-- Messages table
CREATE TABLE messages (
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
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES users(id),
  verdict TEXT CHECK (verdict IN ('safe', 'unsafe')),
  feedback TEXT,
  corrected_response TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Feedback memory table
CREATE TABLE feedback_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_type TEXT,
  pattern TEXT,
  human_feedback TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security (optional, adjust as needed)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_memory ENABLE ROW LEVEL SECURITY;
```

### 5. Configure Supabase Auth

1. Go to your Supabase project dashboard
2. Navigate to Authentication > Providers
3. Enable Google OAuth
4. Add your Google OAuth credentials
5. Add authorized redirect URLs: `http://localhost:3000`

### 6. Run the Application

```bash
npm run dev
```

This will start both backend (port 3001) and frontend (port 3000) servers.

## Project Structure

```
kintsugi/
├── backend/
│   ├── config/
│   │   └── safetyRules.js      # Safety rule configuration
│   ├── services/
│   │   ├── geminiService.js     # Gemini AI integration
│   │   ├── safetyService.js   # Safety evaluation logic
│   │   └── dbService.js        # Database operations
│   ├── server.js               # Express server
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── ui/             # shadcn/ui components
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx # Authentication context
│   │   ├── lib/
│   │   │   ├── api.js          # API client
│   │   │   ├── supabase.js     # Supabase client
│   │   │   └── utils.js        # Utility functions
│   │   ├── pages/
│   │   │   ├── Landing.jsx     # Landing page
│   │   │   ├── Chat.jsx        # Chat interface
│   │   │   └── AdminDashboard.jsx # Admin dashboard
│   │   ├── App.jsx             # Main app component
│   │   └── main.jsx            # Entry point
│   └── package.json
└── package.json
```

## Usage

1. **As a User:**
   - Visit `http://localhost:3000`
   - Sign in with Google
   - Start chatting with the AI
   - Conversations are monitored for safety

2. **As an Admin:**
   - Sign in with an email listed in `ADMIN_EMAILS`
   - Access the Admin Dashboard
   - Review flagged messages
   - Approve or correct AI responses

## Safety Features

- **Rule-Based Detection**: Keyword and pattern matching
- **AI Safety Critic**: Gemini-powered safety evaluation
- **Risk Scoring**: Multi-factor risk assessment
- **Human Review**: Mandatory review for high-risk responses
- **Feedback Memory**: Learning from human corrections

## Important Notes

- This is a **demo/prototype** application
- **Not a replacement** for professional therapy
- Conversations auto-delete after 3 days
- All high-risk responses require human review

## License

MIT
