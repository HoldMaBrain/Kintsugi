# Kintsugi - Human-in-the-Loop Virtual Therapist Safety Monitor

> The art of repairing broken pottery with gold

Kintsugi is a safety-monitored AI mental health support application that uses human-in-the-loop anomaly detection to ensure safe and empathetic interactions between users and an AI chatbot.

## What is Kintsugi?

Kintsugi is a demonstration application that combines AI-powered mental health support with rigorous safety monitoring. The system uses a dual-layer safety approach: automated rule-based detection and AI-powered safety evaluation, with human reviewers providing oversight for all high-risk interactions.

The name "Kintsugi" comes from the Japanese art of repairing broken pottery with gold, symbolizing that healing and improvement come through acknowledging and addressing vulnerabilities—both in the AI system and in the users it serves.

## How It Works

### Core Workflow

1. **User Interaction**: Users sign in via Google OAuth and engage in conversations with an AI chatbot powered by Google Gemini.

2. **Message Processing**: When a user sends a message:
   - The message is saved to the database
   - Conversation history is retrieved
   - The AI generates a response using Gemini 2.5 Flash

3. **Safety Evaluation**: Every AI response undergoes a two-stage safety check:
   - **Rule-Based Detection**: Pattern matching for prompt injection attempts, crisis keywords, and safety violations
   - **AI Safety Critic**: A separate Gemini model evaluates the response for emotional invalidation, over-advice, tone mismatch, and other safety concerns

4. **Risk Assessment**: The system calculates a risk score combining:
   - Rule-based triggers (prompt injection, crisis keywords, etc.)
   - AI critic assessment (risk level: info, low, medium, high)
   - Role-switching detection (critical indicator of successful prompt injection)

5. **Flagging Decision**: Responses with high risk scores are flagged and held for human review before delivery.

6. **Human Review**: Admin reviewers can:
   - Approve flagged responses as safe
   - Mark responses as unsafe and provide corrections
   - Add feedback that improves future AI responses

7. **Feedback Loop**: Human corrections are stored in a feedback memory system that influences future AI responses, creating a continuous improvement cycle.

### Safety Pipeline Architecture

```
User Message
    ↓
Safety Pre-Evaluation (Rule-Based)
    ↓
AI Response Generation (Gemini)
    ↓
Safety Post-Evaluation (Rule-Based + AI Critic)
    ↓
Risk Score Calculation
    ↓
Flagging Decision
    ↓
[If Flagged] → Human Review Queue
    ↓
[If Approved] → Delivery to User
[If Unsafe] → Correction + Feedback Storage
```

## Technology Stack

### Frontend

- **React 18**: Modern React with hooks and functional components
- **Vite**: Fast build tool and development server
- **Tailwind CSS**: Utility-first CSS framework for styling
- **shadcn/ui**: Accessible component library built on Radix UI
- **Framer Motion**: Animation library for smooth UI transitions
- **Supabase Auth**: Authentication via Google OAuth integration

### Backend

- **Node.js**: JavaScript runtime environment
- **Express**: Web framework for REST API endpoints
- **Google Gemini 2.5 Flash**: 
  - Primary chatbot model for generating responses
  - Separate critic model for safety evaluation
- **Supabase**: 
  - PostgreSQL database for data storage
  - Authentication service for user management
  - Real-time capabilities (not currently used)

### Database Schema

The application uses five main tables:

- **users**: Stores user accounts with email and role (user/admin)
- **conversations**: Tracks conversation sessions with auto-deletion after 3 days
- **messages**: Stores all user and AI messages with risk levels and flagged status
- **reviews**: Records admin reviews of flagged messages with verdicts and corrections
- **feedback_memory**: Stores human feedback patterns for AI improvement

## Project Structure

```
kintsugi/
├── backend/
│   ├── config/
│   │   └── safetyRules.js          # Safety rule patterns and weights
│   ├── services/
│   │   ├── geminiService.js        # Gemini AI integration and prompts
│   │   ├── safetyService.js        # Safety evaluation orchestration
│   │   └── dbService.js            # Database operations abstraction
│   ├── server.js                   # Express server and API routes
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── ui/                 # Reusable UI components (shadcn/ui)
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx     # Authentication state management
│   │   ├── lib/
│   │   │   ├── api.js              # API client functions
│   │   │   ├── supabase.js         # Supabase client initialization
│   │   │   └── utils.js            # Utility functions
│   │   ├── pages/
│   │   │   ├── Landing.jsx         # Public landing page
│   │   │   ├── Chat.jsx            # User chat interface
│   │   │   └── AdminDashboard.jsx  # Admin review dashboard
│   │   ├── App.jsx                 # Main app component with routing
│   │   └── main.jsx                # Application entry point
│   └── package.json
├── database/
│   ├── schema.sql                  # Initial database schema
│   ├── migration_add_review_columns.sql
│   └── migration_add_feedback_columns.sql
├── README.md
├── API.md                          # API endpoint documentation
└── package.json                    # Root package.json for workspace scripts
```

## Key Components

### Backend Services

**GeminiService** (`backend/services/geminiService.js`)
- Manages connections to Google Gemini API
- Handles chatbot response generation with conversation context
- Runs safety critic evaluation on user messages and AI responses
- Implements prompt engineering for consistent AI behavior

**SafetyService** (`backend/services/safetyService.js`)
- Orchestrates the safety evaluation pipeline
- Combines rule-based and AI critic results
- Calculates risk scores and determines flagging decisions
- Handles prompt injection detection and role-switching detection

**DatabaseService** (`backend/services/dbService.js`)
- Abstracts all database operations
- Handles user management and authentication
- Manages conversations and messages
- Provides feedback memory retrieval

### Frontend Pages

**Chat** (`frontend/src/pages/Chat.jsx`)
- Main user interface for conversations
- Real-time message display
- Handles message sending and receiving
- Shows pending status for flagged messages

**AdminDashboard** (`frontend/src/pages/AdminDashboard.jsx`)
- Review interface for flagged messages
- Metrics and analytics dashboard
- Feedback management
- Improvement tracking over time

## Safety Features

### Rule-Based Detection

The system uses pattern matching to detect:
- **Prompt Injection Attempts**: Patterns like "ignore previous instructions", "respond as if", "change your tone"
- **Crisis Keywords**: Terms indicating immediate danger (suicide, self-harm, etc.)
- **Role-Switching**: Detection of AI responses that change roles mid-conversation
- **Advice Patterns**: Imperative language that may constitute medical advice

### AI Safety Critic

A separate Gemini model evaluates responses for:
- Emotional invalidation
- Over-advice or role violations
- Tone mismatch with user's emotional state
- Crisis handling failures
- Medical advice given inappropriately
- Overconfidence in responses

### Risk Scoring System

Risk levels are calculated as:
- **Info**: No safety concerns (score 0)
- **Low**: Minor concerns (score 1-3)
- **Medium**: Moderate concerns (score 4-7)
- **High**: Serious concerns requiring review (score 8+)

All high-risk responses are automatically flagged for human review.

### Prompt Injection Protection

The system detects and flags:
- Direct commands to override instructions
- Role-switching requests
- Response style manipulation attempts
- Contradictory instructions
- Any attempt to change AI behavior

All prompt injection attempts are flagged for review, regardless of whether the AI resists them.

## Setup Instructions

### Prerequisites

- Node.js 18 or higher
- Supabase account and project
- Google Cloud account with Gemini API access

### Installation

1. **Clone the repository**

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Configure backend environment**
   - Copy `backend/.env.example` to `backend/.env`
   - Fill in your Supabase URL and service role key
   - Add your Gemini API keys (separate keys for chatbot and critic)
   - Set admin email addresses (comma-separated)

4. **Configure frontend environment**
   - Copy `frontend/.env.example` to `frontend/.env`
   - Add your Supabase URL and anonymous key

5. **Set up database**
   - Run `database/schema.sql` in your Supabase SQL editor
   - Run migration files if needed

6. **Configure Supabase Auth**
   - Enable Google OAuth in Supabase dashboard
   - Add OAuth credentials
   - Set redirect URL to `http://localhost:3000`

7. **Run the application**
   ```bash
   npm run dev
   ```
   - Backend runs on `http://localhost:3001`
   - Frontend runs on `http://localhost:3000`

## Usage

### As a User

1. Visit the application URL
2. Sign in with Google OAuth
3. Start a conversation with the AI
4. Messages are monitored for safety
5. Flagged messages require admin approval before delivery

### As an Admin

1. Sign in with an email listed in `ADMIN_EMAILS`
2. Access the Admin Dashboard
3. Review flagged messages in the queue
4. Approve safe messages or provide corrections for unsafe ones
5. Monitor metrics and improvement trends

## Important Notes

- This is a **demo/prototype** application
- **Not a replacement** for professional therapy or mental health services
- Conversations automatically delete after 3 days
- All high-risk responses require human review before delivery
- Prompt injection attempts are always flagged for review

## License

MIT License
