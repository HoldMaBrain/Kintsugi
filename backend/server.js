import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { GeminiService } from './services/geminiService.js';
import { SafetyService } from './services/safetyService.js';
import { DatabaseService } from './services/dbService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api/chat/send')) {
    console.log(`🌐 [${req.method}] ${req.path} - Request received at:`, new Date().toISOString());
    console.log(`🌐 Headers:`, { 
      'x-user-email': req.headers['x-user-email'],
      'content-type': req.headers['content-type']
    });
  }
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.error('⚠️ Rate limit exceeded for:', req.ip);
    res.status(429).json({ error: 'Too many requests, please try again later' });
  }
});
app.use('/api/', limiter);

// Initialize services
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERROR: Supabase credentials are missing!');
  console.error('   SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✅ Set' : '❌ Missing');
  process.exit(1);
}

console.log('✅ Supabase URL configured:', supabaseUrl.substring(0, 30) + '...');
const dbService = new DatabaseService(supabaseUrl, supabaseKey);
console.log('✅ Database service initialized');

// Test database connection on startup
(async () => {
  try {
    const { data, error } = await dbService.supabase.from('users').select('count').limit(1);
    if (error) {
      console.error('❌ Database connection test failed:', error);
      console.error('   Make sure you have run the schema.sql in your Supabase SQL editor');
    } else {
      console.log('✅ Database connection test passed');
    }
  } catch (error) {
    console.error('❌ Database connection test error:', error.message);
  }
})();

// Validate Gemini API keys before initializing
const chatbotApiKey = process.env.GEMINI_CHATBOT_API_KEY;
const criticApiKey = process.env.GEMINI_CRITIC_API_KEY;

if (!chatbotApiKey || chatbotApiKey === 'your_gemini_chatbot_api_key' || 
    !criticApiKey || criticApiKey === 'your_gemini_critic_api_key') {
  console.warn('⚠️  WARNING: Gemini API keys not configured. AI features will not work.');
  console.warn('   Please set GEMINI_CHATBOT_API_KEY and GEMINI_CRITIC_API_KEY in backend/.env');
}

let geminiService = null;
let safetyService = null;

try {
  if (chatbotApiKey && criticApiKey && 
      chatbotApiKey !== 'your_gemini_chatbot_api_key' && 
      criticApiKey !== 'your_gemini_critic_api_key') {
    geminiService = new GeminiService(chatbotApiKey, criticApiKey);
    safetyService = new SafetyService(geminiService);
    console.log('✅ Gemini AI services initialized');
  } else {
    console.warn('⚠️  Gemini services not initialized - API keys missing');
  }
} catch (error) {
  console.error('❌ Error initializing Gemini services:', error.message);
}

// Admin email allowlist
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

// Middleware to verify user
async function verifyUser(req, res, next) {
  try {
    const email = req.headers['x-user-email'];
    if (!email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`[verifyUser] Attempting to get/create user for: ${email}`);
    const user = await dbService.getOrCreateUser(email, ADMIN_EMAILS);
    console.log(`[verifyUser] User found/created:`, { id: user.id, email: user.email, role: user.role });
    req.user = user;
    next();
  } catch (error) {
    console.error('[verifyUser] Error verifying user:', error);
    console.error('[verifyUser] Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Middleware to verify admin
function verifyAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get user info
app.get('/api/user', verifyUser, (req, res) => {
  res.json({ user: req.user });
});

// Get conversations
app.get('/api/conversations', verifyUser, async (req, res) => {
  try {
    console.log(`[GET /api/conversations] Fetching conversations for user: ${req.user.id}`);
    const conversations = await dbService.getConversations(
      req.user.id,
      req.user.role === 'admin'
    );
    console.log(`[GET /api/conversations] Found ${conversations.length} conversations`);
    res.json({ conversations });
  } catch (error) {
    console.error('[GET /api/conversations] Error fetching conversations:', error);
    console.error('[GET /api/conversations] Error details:', {
      message: error.message,
      code: error.code,
      details: error.details
    });
    res.status(500).json({ 
      error: 'Failed to fetch conversations',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get single conversation
app.get('/api/conversations/:id', verifyUser, async (req, res) => {
  try {
    const conversation = await dbService.getConversation(
      req.params.id,
      req.user.id,
      req.user.role === 'admin'
    );
    res.json({ conversation });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// Create conversation
app.post('/api/conversations', verifyUser, async (req, res) => {
  try {
    console.log(`[POST /api/conversations] Creating conversation for user: ${req.user.id}`);
    const conversation = await dbService.createConversation(req.user.id);
    console.log(`[POST /api/conversations] Conversation created: ${conversation.id}`);
    res.json({ conversation });
  } catch (error) {
    console.error('[POST /api/conversations] Error creating conversation:', error);
    console.error('[POST /api/conversations] Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to create conversation',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Send message
app.post('/api/chat/send', verifyUser, async (req, res) => {
  const requestStartTime = Date.now();
  console.log('📨 [POST /api/chat/send] ====== REQUEST RECEIVED ======');
  console.log('📨 [POST /api/chat/send] Timestamp:', new Date().toISOString());
  console.log('📨 [POST /api/chat/send] Request body:', { 
    conversationId: req.body.conversationId, 
    messageLength: req.body.message?.length,
    messagePreview: req.body.message?.substring(0, 50),
    userEmail: req.user?.email,
    userId: req.user?.id
  });
  
  try {
    const { conversationId, message } = req.body;
    console.log('📨 [POST /api/chat/send] Parsed body:', { conversationId, messageLength: message?.length });

    if (!conversationId || !message) {
      console.error('❌ Missing conversationId or message');
      return res.status(400).json({ error: 'Missing conversationId or message' });
    }

    console.log('🔍 Fetching conversation...');
    // Verify conversation belongs to user
    const conversation = await dbService.getConversation(
      conversationId,
      req.user.id,
      req.user.role === 'admin'
    );
    console.log('✅ Conversation fetched');

    console.log('💾 Saving user message...');
    // Save user message
    await dbService.createMessage(conversationId, 'user', message);
    console.log('✅ User message saved');

    // Fetch conversation again to get updated history including the new user message
    console.log('🔍 Fetching updated conversation history...');
    const updatedConversation = await dbService.getConversation(
      conversationId,
      req.user.id,
      req.user.role === 'admin'
    );
    
    // Get conversation history - sort by created_at to ensure correct order
    const history = (updatedConversation.messages || []).sort((a, b) => 
      new Date(a.created_at) - new Date(b.created_at)
    );
    const conversationHistory = history
      .filter(msg => msg.content && msg.content.trim()) // Filter empty messages
      .map(msg => ({
        sender: msg.sender,
        content: msg.content
      }));
    console.log(`📜 Conversation history: ${conversationHistory.length} messages`);
    console.log(`   History breakdown: ${conversationHistory.filter(m => m.sender === 'user').length} user, ${conversationHistory.filter(m => m.sender === 'ai').length} AI`);

    // Check if Gemini services are available
    if (!geminiService || !safetyService) {
      console.error('❌ Gemini services not initialized');
      return res.status(503).json({ 
        error: 'AI services not available. Please configure Gemini API keys in backend/.env' 
      });
    }
    console.log('✅ Gemini services available');

    console.log('🧠 Getting feedback memory...');
    // Get feedback memory
    const feedbackMemory = await dbService.getFeedbackMemory(5);
    console.log(`✅ Feedback memory: ${feedbackMemory.length} items`);

    // Generate AI response
    let aiResponse;
    try {
      console.log('🤖 Generating AI response with Gemini...');
      console.log('   Model: gemini-2.5-flash-lite');
      console.log('   History length:', conversationHistory.length);
      console.log('   User message:', message.substring(0, 50) + '...');
      
      const startTime = Date.now();
      aiResponse = await geminiService.generateResponse(
        conversationHistory,
        message,
        feedbackMemory
      );
      const duration = Date.now() - startTime;
      console.log(`✅ AI response generated successfully in ${duration}ms`);
      console.log('   Response length:', aiResponse.length);
    } catch (error) {
      console.error('❌ Error generating AI response:', error);
      console.error('   Error name:', error.name);
      console.error('   Error message:', error.message);
      console.error('   Error stack:', error.stack);
      return res.status(500).json({ 
        error: `Failed to generate AI response: ${error.message}. Check your Gemini API keys and quota.` 
      });
    }

    // Evaluate safety
    console.log('🛡️  Evaluating safety...');
    let safetyResult;
    try {
      const safetyStartTime = Date.now();
      safetyResult = await safetyService.evaluateMessage(
        message,
        aiResponse,
        conversationHistory,
        feedbackMemory
      );
      const safetyDuration = Date.now() - safetyStartTime;
      console.log(`✅ Safety evaluation completed in ${safetyDuration}ms`);
      console.log(`   Risk level: ${safetyResult.riskLevel}, Flagged: ${safetyResult.flagged}`);
    } catch (error) {
      console.error('❌ Error evaluating safety:', error);
      // Continue with default safety result if critic fails
      safetyResult = {
        riskLevel: 'medium',
        riskScore: 3,
        ruleTriggers: [],
        criticIssues: ['safety_evaluation_error'],
        explanation: 'Safety evaluation encountered an error',
        flagged: false
      };
    }

    // Save AI message
    console.log('💾 Saving AI message...');
    const aiMessage = await dbService.createMessage(
      conversationId,
      'ai',
      aiResponse,
      safetyResult.riskLevel,
      safetyResult.flagged
    );
    console.log('✅ AI message saved');

    console.log('📤 Sending response to client...');
    res.json({
      message: aiMessage,
      status: safetyResult.flagged ? 'pending' : 'delivered',
      riskLevel: safetyResult.riskLevel
    });
    console.log('✅ Response sent successfully');
  } catch (error) {
    console.error('❌ Error in send message endpoint:', error);
    console.error('   Error name:', error.name);
    console.error('   Error message:', error.message);
    console.error('   Error stack:', error.stack);
    
    // Make sure we always send a response
    if (!res.headersSent) {
      res.status(500).json({ 
        error: `Failed to send message: ${error.message}` 
      });
    }
  }
});

// Delete conversation
app.delete('/api/conversations/:id', verifyUser, async (req, res) => {
  try {
    await dbService.deleteConversation(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// Admin: Get flagged messages
app.get('/api/admin/flagged', verifyUser, verifyAdmin, async (req, res) => {
  try {
    const flaggedMessages = await dbService.getFlaggedMessages();
    res.json({ messages: flaggedMessages });
  } catch (error) {
    console.error('Error fetching flagged messages:', error);
    res.status(500).json({ error: 'Failed to fetch flagged messages' });
  }
});

// Admin: Review message
app.post('/api/admin/review', verifyUser, verifyAdmin, async (req, res) => {
  try {
    const { messageId, verdict, feedback, correctedResponse } = req.body;

    if (!messageId || !verdict) {
      return res.status(400).json({ error: 'Missing messageId or verdict' });
    }

    // Create review
    await dbService.createReview(
      messageId,
      req.user.id,
      verdict,
      feedback,
      correctedResponse
    );

    // Update message
    const finalResponse = verdict === 'safe' 
      ? null // Use original response
      : correctedResponse;

    if (finalResponse) {
      await dbService.updateMessage(messageId, {
        content: finalResponse,
        finalized: true,
        flagged: false
      });
    } else {
      await dbService.updateMessage(messageId, {
        finalized: true,
        flagged: false
      });
    }

    // Store feedback if unsafe
    if (verdict === 'unsafe' && feedback) {
      const message = await dbService.supabase
        .from('messages')
        .select('content')
        .eq('id', messageId)
        .single();

      if (message.data) {
        await dbService.addFeedbackMemory(
          'unsafe_response',
          message.data.content.substring(0, 100),
          feedback
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error reviewing message:', error);
    res.status(500).json({ error: 'Failed to review message' });
  }
});

// Admin: Get metrics
app.get('/api/admin/metrics', verifyUser, verifyAdmin, async (req, res) => {
  try {
    const { data: messages } = await dbService.supabase
      .from('messages')
      .select('risk_level, flagged, created_at');

    const totalMessages = messages.length;
    const flaggedCount = messages.filter(m => m.flagged).length;
    const highRiskCount = messages.filter(m => m.risk_level === 'high').length;
    const mediumRiskCount = messages.filter(m => m.risk_level === 'medium').length;

    const { data: reviews } = await dbService.supabase
      .from('reviews')
      .select('verdict');

    const unsafeCount = reviews.filter(r => r.verdict === 'unsafe').length;
    const safeCount = reviews.filter(r => r.verdict === 'safe').length;
    const correctionRate = reviews.length > 0 ? (unsafeCount / reviews.length) * 100 : 0;

    res.json({
      totalMessages,
      flaggedCount,
      highRiskCount,
      mediumRiskCount,
      flaggedPercentage: totalMessages > 0 ? (flaggedCount / totalMessages) * 100 : 0,
      correctionRate,
      totalReviews: reviews.length
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Kintsugi backend server running on http://localhost:${PORT}`);
});
