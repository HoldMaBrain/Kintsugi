# Kintsugi Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
npm run install:all
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the contents of `database/schema.sql`
3. Go to Authentication > Providers and enable Google OAuth
4. Add your Google OAuth credentials
5. Add redirect URL: `http://localhost:3000`

### 3. Get Google Gemini API Keys

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create two API keys (one for chatbot, one for critic)
3. Copy the keys

### 4. Configure Environment Variables

**Backend** (`backend/.env`):
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GEMINI_CHATBOT_API_KEY=your_chatbot_api_key
GEMINI_CRITIC_API_KEY=your_critic_api_key
PORT=3001
ADMIN_EMAILS=your-admin-email@example.com
```

**Frontend** (`frontend/.env`):
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### 5. Run the Application

```bash
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:3001

## Notes

- **Gemini Model**: The app uses `gemini-1.5-flash` by default. If you have access to `gemini-2.5-flash`, update `backend/services/geminiService.js`
- **Admin Access**: Add admin emails to `ADMIN_EMAILS` in `backend/.env` (comma-separated)
- **Database**: Conversations auto-delete after 3 days

## Troubleshooting

### "Not authenticated" errors
- Make sure Supabase Auth is configured correctly
- Check that redirect URLs match in Supabase settings

### Gemini API errors
- Verify API keys are correct
- Check API quota/limits in Google Cloud Console
- Update model name if needed

### Database errors
- Ensure schema.sql was run successfully
- Check Supabase connection strings
- Verify RLS policies if needed
