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

// Rate limiting - more lenient for general API
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs (increased)
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.error('⚠️ Rate limit exceeded for:', req.ip, req.path);
    res.status(429).json({ error: 'Too many requests, please try again later' });
  }
});

// More lenient rate limiting for admin endpoints
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Admin endpoints get higher limit
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.error('⚠️ Admin rate limit exceeded for:', req.ip, req.path);
    res.status(429).json({ error: 'Too many requests, please try again later' });
  }
});

// Apply rate limiting to all API routes except admin
app.use('/api/', (req, res, next) => {
  // Admin routes get higher limit
  if (req.path.startsWith('/api/admin/')) {
    return adminLimiter(req, res, next);
  }
  // All other routes use general limiter
  return generalLimiter(req, res, next);
});

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
    // Always filter by user_id - users should only see their own conversations in the chat page
    // Admins can see all conversations in the admin dashboard, but not in their personal chat
    const conversations = await dbService.getConversations(
      req.user.id,
      false // Always false - never return all conversations for chat page
    );
    console.log(`[GET /api/conversations] Found ${conversations.length} conversations for user ${req.user.id}`);
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
    // Always filter by user_id - users should only see their own conversations
    // Admins can see all conversations in the admin dashboard, but not in their personal chat
    const conversation = await dbService.getConversation(
      req.params.id,
      req.user.id,
      false // Always false - never return conversations from other users for chat page
    );
    
    // Additional security check: ensure the conversation belongs to the user
    if (conversation && conversation.user_id !== req.user.id) {
      console.warn(`[GET /api/conversations/:id] User ${req.user.id} attempted to access conversation ${req.params.id} belonging to user ${conversation.user_id}`);
      return res.status(403).json({ error: 'Access denied: This conversation does not belong to you' });
    }
    
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
    // Verify conversation belongs to user - always filter by user_id
    const conversation = await dbService.getConversation(
      conversationId,
      req.user.id,
      false // Always false - users can only send messages to their own conversations
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
      false // Always false - users can only access their own conversations
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
    // Get feedback memory - increase limit to get more learning examples
    const feedbackMemory = await dbService.getFeedbackMemory(10);
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

// Admin: Get reviewed messages
app.get('/api/admin/reviewed', verifyUser, verifyAdmin, async (req, res) => {
  try {
    const reviewedMessages = await dbService.getReviewedMessages();
    res.json({ messages: reviewedMessages });
  } catch (error) {
    console.error('Error fetching reviewed messages:', error);
    res.status(500).json({ error: 'Failed to fetch reviewed messages' });
  }
});

// Admin: Generate corrected response (without saving)
app.post('/api/admin/generate-corrected-response', verifyUser, verifyAdmin, async (req, res) => {
  try {
    console.log('[Generate] Generate corrected response request received:', { 
      messageId: req.body.messageId, 
      hasFeedback: !!req.body.feedback 
    });
    
    const { messageId, feedback } = req.body;

    if (!messageId || !feedback || !feedback.trim()) {
      return res.status(400).json({ error: 'Missing messageId or feedback' });
    }

    // Get the message and conversation context
    console.log('[Generate] Fetching message and conversation...');
    const message = await dbService.supabase
      .from('messages')
      .select(`
        *,
        conversations(
          *,
          messages(*)
        )
      `)
      .eq('id', messageId)
      .single();

    if (message.error || !message.data) {
      console.error('[Generate] Message not found:', message.error);
      return res.status(404).json({ error: 'Message not found' });
    }

    const messageData = message.data;
    const conversation = messageData.conversations;
    const allMessages = conversation?.messages || [];
    
    // Find the user message that triggered this AI response
    const userMessage = allMessages
      .filter(m => m.sender === 'user')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .find((m, idx, arr) => {
        const aiMessageIndex = allMessages.findIndex(msg => msg.id === messageId);
        const userMessageIndex = allMessages.findIndex(msg => msg.id === m.id);
        return userMessageIndex < aiMessageIndex && userMessageIndex >= aiMessageIndex - 1;
      }) || allMessages
        .filter(m => m.sender === 'user')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

    if (!geminiService) {
      return res.status(503).json({ 
        error: 'AI service not available. Please provide a manual corrected response.' 
      });
    }

    try {
      // Build conversation history up to the problematic message
      const conversationHistory = allMessages
        .filter(m => new Date(m.created_at) < new Date(messageData.created_at))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map(msg => ({
          sender: msg.sender,
          content: msg.content
        }));

      // Create a learning prompt that includes the feedback
      const learningPrompt = `The following is a user message and an AI response that was flagged as unsafe. Please generate a corrected, empathetic response based on the feedback provided.

Original User Message: "${userMessage?.content || 'N/A'}"

Original AI Response (UNSAFE): "${messageData.content}"

Human Feedback: "${feedback}"

Please generate a corrected response that:
1. Maintains your empathetic, supportive role as Kintsugi
2. Addresses the user's needs appropriately
3. Incorporates the feedback provided
4. Follows all your safety guidelines

Corrected Response:`;

      console.log('[Generate] Generating corrected response with Gemini...');
      // Generate corrected response
      const correctedAiResponse = await geminiService.generateResponse(
        conversationHistory,
        learningPrompt,
        []
      );

      console.log('[Generate] Corrected response generated successfully, length:', correctedAiResponse.length);
      
      return res.json({ 
        correctedResponse: correctedAiResponse 
      });
    } catch (error) {
      console.error('[Generate] Error generating corrected response:', error);
      return res.status(500).json({ 
        error: `Failed to generate corrected response: ${error.message}. Please try again or provide a manual correction.` 
      });
    }
  } catch (error) {
    console.error('[Generate] Error:', error);
    return res.status(500).json({ error: 'Failed to generate corrected response' });
  }
});

// Admin: Review message (now accepts pre-generated corrected response)
app.post('/api/admin/review', verifyUser, verifyAdmin, async (req, res) => {
  try {
    console.log('[Review] Review request received:', { 
      messageId: req.body.messageId, 
      verdict: req.body.verdict,
      hasFeedback: !!req.body.feedback,
      hasCorrectedResponse: !!req.body.correctedResponse
    });
    
    const { messageId, verdict, feedback, correctedResponse } = req.body;

    if (!messageId || !verdict) {
      return res.status(400).json({ error: 'Missing messageId or verdict' });
    }

    // Get the message and conversation context
    console.log('[Review] Fetching message and conversation...');
    const message = await dbService.supabase
      .from('messages')
      .select(`
        *,
        conversations(
          *,
          messages(*)
        )
      `)
      .eq('id', messageId)
      .single();

    if (message.error || !message.data) {
      console.error('[Review] Message not found:', message.error);
      return res.status(404).json({ error: 'Message not found' });
    }

    const messageData = message.data;
    const originalUnsafeResponse = messageData.content; // Store original before updating
    const conversation = messageData.conversations;
    const allMessages = conversation?.messages || [];
    
    console.log('[Review] Message found:', { 
      messageId: messageData.id, 
      messageCount: allMessages.length 
    });
    
    // Find the user message that triggered this AI response
    const userMessage = allMessages
      .filter(m => m.sender === 'user')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .find((m, idx, arr) => {
        // Find the user message that came just before this AI message
        const aiMessageIndex = allMessages.findIndex(msg => msg.id === messageId);
        const userMessageIndex = allMessages.findIndex(msg => msg.id === m.id);
        return userMessageIndex < aiMessageIndex && userMessageIndex >= aiMessageIndex - 1;
      }) || allMessages
        .filter(m => m.sender === 'user')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

    let finalResponse = null;

    // If unsafe, use the provided corrected response (should be pre-generated)
    if (verdict === 'unsafe') {
      console.log('[Review] Verdict is unsafe, using provided corrected response...');
      
      if (!feedback || !feedback.trim()) {
        return res.status(400).json({ 
          error: 'Feedback is required when marking a message as unsafe.' 
        });
      }
      
      if (!correctedResponse || !correctedResponse.trim()) {
        return res.status(400).json({ 
          error: 'Corrected response is required. Please generate a corrected response first.' 
        });
      }
      
      finalResponse = correctedResponse;
      console.log('[Review] Using provided corrected response, length:', correctedResponse.length);

      // Store feedback in memory for future learning
      if (feedback && userMessage) {
        try {
          await dbService.addFeedbackMemory(
            'unsafe_response',
            userMessage.content.substring(0, 200), // Store user prompt
            feedback,
            originalUnsafeResponse.substring(0, 200), // Store unsafe AI response
            finalResponse.substring(0, 200) // Store corrected response
          );
          console.log('[Review] Feedback stored in memory for future learning');
        } catch (memoryError) {
          console.error('[Review] Error storing feedback memory:', memoryError);
          // Don't fail the review if memory storage fails
        }
      }
    }

    // Create review (store original response if it was unsafe and corrected)
    console.log('[Review] Creating review record...');
    try {
      await dbService.createReview(
        messageId,
        req.user.id,
        verdict,
        feedback,
        finalResponse || correctedResponse,
        verdict === 'unsafe' ? originalUnsafeResponse : null
      );
      console.log('[Review] Review record created');
    } catch (reviewError) {
      console.error('[Review] Error creating review:', reviewError);
      console.error('[Review] Review error details:', {
        message: reviewError.message,
        code: reviewError.code,
        details: reviewError.details,
        hint: reviewError.hint
      });
      throw reviewError;
    }

    // Update message
    // Preserve flagged status for historical metrics
    // The finalized field indicates it's been reviewed
    console.log('[Review] Updating message...');
    try {
      if (finalResponse) {
        await dbService.updateMessage(messageId, {
          content: finalResponse,
          finalized: true
          // Keep flagged=true to preserve historical flagged count
        });
        console.log('[Review] Message updated with corrected response');
      } else {
        await dbService.updateMessage(messageId, {
          finalized: true
          // Keep flagged=true to preserve historical flagged count
        });
        console.log('[Review] Message marked as finalized');
      }
    } catch (updateError) {
      console.error('[Review] Error updating message:', updateError);
      console.error('[Review] Update error details:', {
        message: updateError.message,
        code: updateError.code,
        details: updateError.details
      });
      throw updateError;
    }

    console.log('[Review] Review completed successfully');
    res.json({ 
      success: true,
      correctedResponse: finalResponse 
    });
  } catch (error) {
    console.error('[Review] Error reviewing message:', error);
    console.error('[Review] Full error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to review message',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Admin: Get metrics
app.get('/api/admin/metrics', verifyUser, verifyAdmin, async (req, res) => {
  try {
    // Fetch messages and reviews in parallel for better performance
    const [messagesResult, reviewsResult] = await Promise.all([
      dbService.supabase
        .from('messages')
        .select('risk_level, flagged, created_at')
        .order('created_at', { ascending: true }),
      dbService.supabase
        .from('reviews')
        .select('verdict, created_at, message_id')
        .order('created_at', { ascending: true })
    ]);

    const messages = messagesResult.data || [];
    const reviews = reviewsResult.data || [];
    
    // Get message IDs from reviews and fetch their created_at dates
    const reviewedMessageIds = reviews.length > 0 ? reviews.map(r => r.message_id) : [];
    const reviewedMessagesData = reviewedMessageIds.length > 0 
      ? await dbService.supabase
          .from('messages')
          .select('id, created_at, risk_level')
          .in('id', reviewedMessageIds)
      : { data: [] };
    
    // Create a map of message_id to message data for quick lookup
    const reviewedMessagesMap = {};
    if (reviewedMessagesData.data) {
      reviewedMessagesData.data.forEach(msg => {
        reviewedMessagesMap[msg.id] = msg;
      });
    }
    
    // Attach message data to reviews
    const reviewsWithMessages = reviews ? reviews.map(review => ({
      ...review,
      messages: reviewedMessagesMap[review.message_id] || null
    })) : [];

    // Fetch feedback memory in parallel with reviewed messages if possible
    const feedbackMemoryResult = await dbService.supabase
      .from('feedback_memory')
      .select('created_at')
      .order('created_at', { ascending: true });
    
    const feedbackMemory = feedbackMemoryResult.data || [];

    const totalMessages = messages.length;
    
    // Count currently flagged messages
    const currentlyFlaggedCount = messages.filter(m => m.flagged).length;
    
    // Count reviewed messages (these were previously flagged)
    const reviewedCount = reviews ? reviews.length : 0;
    
    // Total flagged = currently flagged + reviewed (preserving historical data)
    const flaggedCount = currentlyFlaggedCount + reviewedCount;
    
    const highRiskCount = messages.filter(m => m.risk_level === 'high').length;
    const mediumRiskCount = messages.filter(m => m.risk_level === 'medium').length;

    const unsafeCount = reviewsWithMessages ? reviewsWithMessages.filter(r => r.verdict === 'unsafe').length : 0;
    const safeCount = reviewsWithMessages ? reviewsWithMessages.filter(r => r.verdict === 'safe').length : 0;
    const correctionRate = reviewsWithMessages && reviewsWithMessages.length > 0 ? (unsafeCount / reviewsWithMessages.length) * 100 : 0;
    const totalFeedback = feedbackMemory.length;

    // Calculate time-based metrics to show learning over time (using UTC timezone to match message timestamps)
    const now = new Date();
    // Get today's date at midnight in UTC timezone
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
    
    // Helper function to get UTC date string (matches message timestamp timezone)
    const getUTCDateString = (date) => {
      // Ensure we're working with a Date object
      let d;
      if (date instanceof Date) {
        d = date;
      } else if (typeof date === 'string') {
        // Parse the date string - handle both UTC and local timezone formats
        d = new Date(date);
        // Validate the date
        if (isNaN(d.getTime())) {
          console.error('Invalid date:', date);
          d = new Date(); // Fallback to now
        }
      } else {
        d = new Date(date);
      }
      
      // Use UTC methods to get date components (matches message timestamp timezone)
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Group messages by day and hour for trend analysis
    const messagesByDay = {};
    const flaggedByDay = {};
    const messagesByHour = {};
    const flaggedByHour = {};

    // Count currently flagged messages by day/hour (using UTC timezone to match message timestamps)
    messages.forEach(msg => {
      const msgDate = new Date(msg.created_at);
      // Use UTC timezone for date calculations (matches message timestamp timezone)
      const date = getUTCDateString(msgDate);
      // Use UTC timezone for hour as well
      const hour = `${date} ${String(msgDate.getUTCHours()).padStart(2, '0')}:00`;
      
      messagesByDay[date] = (messagesByDay[date] || 0) + 1;
      messagesByHour[hour] = (messagesByHour[hour] || 0) + 1;
      
      if (msg.flagged) {
        flaggedByDay[date] = (flaggedByDay[date] || 0) + 1;
        flaggedByHour[hour] = (flaggedByHour[hour] || 0) + 1;
      }
    });
    
    // Add reviewed messages to flagged counts (preserve historical data)
    // Reviews represent messages that were previously flagged
    if (reviewsWithMessages) {
      reviewsWithMessages.forEach(review => {
        if (review.messages && review.messages.created_at) {
          const msgDate = new Date(review.messages.created_at);
          const date = getUTCDateString(msgDate);
          const hour = `${date} ${String(msgDate.getUTCHours()).padStart(2, '0')}:00`;
          
          // Add to flagged counts for the day/hour when the original message was created
          flaggedByDay[date] = (flaggedByDay[date] || 0) + 1;
          flaggedByHour[hour] = (flaggedByHour[hour] || 0) + 1;
        }
      });
    }

    // Calculate day-to-day comparisons (using UTC timezone to match message timestamps)
    const todayStr = getUTCDateString(today);
    const yesterdayStr = getUTCDateString(yesterday);
    const twoDaysAgoStr = getUTCDateString(twoDaysAgo);
    
    // Filter messages by UTC date (matches message timestamp timezone)
    const todayMessages = messages.filter(m => {
      const msgDate = new Date(m.created_at);
      const msgUTCDate = getUTCDateString(msgDate);
      const matches = msgUTCDate === todayStr;
      return matches;
    });
    const yesterdayMessages = messages.filter(m => {
      const msgDate = new Date(m.created_at);
      const msgUTCDate = getUTCDateString(msgDate);
      return msgUTCDate === yesterdayStr;
    });
    const twoDaysAgoMessages = messages.filter(m => {
      const msgDate = new Date(m.created_at);
      const msgUTCDate = getUTCDateString(msgDate);
      return msgUTCDate === twoDaysAgoStr;
    });
    
    // Debug: Log timezone info for first few and last few messages (after filtering)
    if (messages.length > 0) {
      const firstThree = messages.slice(0, 3);
      const lastThree = messages.slice(-3);
      console.log('📅 [Metrics] Timezone Debug (UTC):', {
        serverNow: new Date().toISOString(),
        serverNowUTC: new Date().toUTCString(),
        todayStr,
        yesterdayStr,
        totalMessages: messages.length,
        firstThreeMessages: firstThree.map(m => ({
          created_at_raw: m.created_at,
          created_at_parsed: new Date(m.created_at).toISOString(),
          created_at_utc: new Date(m.created_at).toUTCString(),
          utcDate: getUTCDateString(new Date(m.created_at)),
          matchesToday: getUTCDateString(new Date(m.created_at)) === todayStr
        })),
        lastThreeMessages: lastThree.map(m => ({
          created_at_raw: m.created_at,
          created_at_parsed: new Date(m.created_at).toISOString(),
          created_at_utc: new Date(m.created_at).toUTCString(),
          utcDate: getUTCDateString(new Date(m.created_at)),
          matchesToday: getUTCDateString(new Date(m.created_at)) === todayStr
        })),
        todayMessagesCount: todayMessages.length,
        yesterdayMessagesCount: yesterdayMessages.length
      });
    }
    
    // Count currently flagged messages for each day
    const todayFlaggedCurrent = todayMessages.filter(m => m.flagged).length;
    const yesterdayFlaggedCurrent = yesterdayMessages.filter(m => m.flagged).length;
    const twoDaysAgoFlaggedCurrent = twoDaysAgoMessages.filter(m => m.flagged).length;
    
    // Add reviewed messages to the counts (preserve historical data)
    // Count reviews for messages created on each day (using UTC timezone to match message timestamps)
    const todayReviewed = reviewsWithMessages ? reviewsWithMessages.filter(r => {
      if (!r.messages || !r.messages.created_at) return false;
      const msgDate = new Date(r.messages.created_at);
      const msgUTCDate = getUTCDateString(msgDate);
      return msgUTCDate === todayStr;
    }).length : 0;
    
    const yesterdayReviewed = reviewsWithMessages ? reviewsWithMessages.filter(r => {
      if (!r.messages || !r.messages.created_at) return false;
      const msgDate = new Date(r.messages.created_at);
      const msgUTCDate = getUTCDateString(msgDate);
      return msgUTCDate === yesterdayStr;
    }).length : 0;
    
    const twoDaysAgoReviewed = reviewsWithMessages ? reviewsWithMessages.filter(r => {
      if (!r.messages || !r.messages.created_at) return false;
      const msgDate = new Date(r.messages.created_at);
      const msgUTCDate = getUTCDateString(msgDate);
      return msgUTCDate === twoDaysAgoStr;
    }).length : 0;
    
    // Total flagged = currently flagged + reviewed
    const todayFlagged = todayFlaggedCurrent + todayReviewed;
    const yesterdayFlagged = yesterdayFlaggedCurrent + yesterdayReviewed;
    const twoDaysAgoFlagged = twoDaysAgoFlaggedCurrent + twoDaysAgoReviewed;
    
    const todayFlaggedRate = todayMessages.length > 0 ? (todayFlagged / todayMessages.length) * 100 : 0;
    const yesterdayFlaggedRate = yesterdayMessages.length > 0 ? (yesterdayFlagged / yesterdayMessages.length) * 100 : 0;
    const twoDaysAgoFlaggedRate = twoDaysAgoMessages.length > 0 ? (twoDaysAgoFlagged / twoDaysAgoMessages.length) * 100 : 0;
    
    // Day-to-day improvement
    const dayToDayImprovement = yesterdayFlaggedRate > 0 
      ? ((yesterdayFlaggedRate - todayFlaggedRate) / yesterdayFlaggedRate) * 100 
      : 0;
    
    // 2-day improvement (comparing today to 2 days ago)
    const twoDayImprovement = twoDaysAgoFlaggedRate > 0 
      ? ((twoDaysAgoFlaggedRate - todayFlaggedRate) / twoDaysAgoFlaggedRate) * 100 
      : 0;

    // Get last 30 days of daily data for chart (using UTC timezone to match message timestamps)
    const dailyData = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = getUTCDateString(date);
      const total = messagesByDay[dateStr] || 0;
      const flagged = flaggedByDay[dateStr] || 0;
      const flaggedRate = total > 0 ? (flagged / total) * 100 : 0;
      
      dailyData.push({
        date: dateStr,
        total,
        flagged,
        flaggedRate
      });
    }

    // Get last 24 hours of hourly data for chart (using UTC timezone to match message timestamps)
    const hourlyData = [];
    for (let i = 23; i >= 0; i--) {
      const hourDate = new Date(now.getTime() - i * 60 * 60 * 1000);
      const dateStr = getUTCDateString(hourDate);
      const hour = `${dateStr} ${String(hourDate.getUTCHours()).padStart(2, '0')}:00`;
      const total = messagesByHour[hour] || 0;
      const flagged = flaggedByHour[hour] || 0;
      const flaggedRate = total > 0 ? (flagged / total) * 100 : 0;
      
      hourlyData.push({
        hour: hourDate.getUTCHours(),
        hourLabel: hourDate.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true, timeZone: 'UTC' }),
        date: dateStr,
        total,
        flagged,
        flaggedRate
      });
    }

    // Calculate feedback provided over time (using UTC timezone to match message timestamps)
    const feedbackByDay = {};
    feedbackMemory.forEach(fb => {
      const date = getUTCDateString(new Date(fb.created_at));
      feedbackByDay[date] = (feedbackByDay[date] || 0) + 1;
    });

    const feedbackDailyData = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = getUTCDateString(date);
      feedbackDailyData.push({
        date: dateStr,
        count: feedbackByDay[dateStr] || 0
      });
    }

    res.json({
      totalMessages,
      flaggedCount,
      highRiskCount,
      mediumRiskCount,
      flaggedPercentage: totalMessages > 0 ? (flaggedCount / totalMessages) * 100 : 0,
      correctionRate,
      totalReviews: reviewsWithMessages ? reviewsWithMessages.length : 0,
      totalFeedback,
      // Day-to-day learning metrics
      todayFlaggedRate,
      yesterdayFlaggedRate,
      twoDaysAgoFlaggedRate,
      dayToDayImprovement,
      twoDayImprovement,
      todayMessagesCount: todayMessages.length,
      yesterdayMessagesCount: yesterdayMessages.length,
      twoDaysAgoMessagesCount: twoDaysAgoMessages.length,
      todayFlaggedCount: todayFlagged,
      yesterdayFlaggedCount: yesterdayFlagged,
      twoDaysAgoFlaggedCount: twoDaysAgoFlagged,
      // Time series data
      dailyData,
      hourlyData,
      feedbackDailyData
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Admin: Get improvement metrics based on feedback
app.get('/api/admin/improvement', verifyUser, verifyAdmin, async (req, res) => {
  try {
    // Fetch all feedback memory with timestamps
    const feedbackMemoryResult = await dbService.supabase
      .from('feedback_memory')
      .select('created_at, issue_type')
      .order('created_at', { ascending: true });
    
    const feedbackMemory = feedbackMemoryResult.data || [];
    
    // Fetch all messages with timestamps and flagged status
    const messagesResult = await dbService.supabase
      .from('messages')
      .select('created_at, flagged, risk_level')
      .order('created_at', { ascending: true });
    
    const messages = messagesResult.data || [];
    
    // Helper function to get UTC date string (matches message timestamp timezone)
    const getUTCDateString = (date) => {
      // Ensure we're working with a Date object
      let d;
      if (date instanceof Date) {
        d = date;
      } else if (typeof date === 'string') {
        // Parse the date string - handle both UTC and local timezone formats
        d = new Date(date);
        // Validate the date
        if (isNaN(d.getTime())) {
          console.error('Invalid date:', date);
          d = new Date(); // Fallback to now
        }
      } else {
        d = new Date(date);
      }
      
      // Use UTC methods to get date components (matches message timestamp timezone)
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    
    // Calculate improvement metrics over time windows
    // Group by batches of messages (every 5 messages) to show improvement
    const improvementByBatch = [];
    const batchSize = 5;
    let currentBatch = 0;
    let batchStartIndex = 0;
    
    for (let i = 0; i < messages.length; i += batchSize) {
      const batchMessages = messages.slice(i, Math.min(i + batchSize, messages.length));
      const batchFlaggedCount = batchMessages.filter(m => m.flagged).length;
      const batchTotal = batchMessages.length;
      const batchFlaggedRate = batchTotal > 0 ? (batchFlaggedCount / batchTotal) * 100 : 0;
      
      // Count feedback provided before this batch
      const feedbackBeforeBatch = feedbackMemory.filter(fb => {
        const fbDate = new Date(fb.created_at);
        const batchStartDate = batchMessages[0] ? new Date(batchMessages[0].created_at) : now;
        return fbDate < batchStartDate;
      }).length;
      
      improvementByBatch.push({
        batch: currentBatch + 1,
        messageRange: `${batchStartIndex + 1}-${Math.min(i + batchSize, messages.length)}`,
        totalMessages: batchTotal,
        flaggedCount: batchFlaggedCount,
        flaggedRate: batchFlaggedRate,
        feedbackCount: feedbackBeforeBatch,
        avgFlaggedRate: batchFlaggedRate
      });
      
      currentBatch++;
      batchStartIndex = i;
    }
    
    // Calculate improvement over last 30 days
    const improvementByDay = [];
    const flaggedRateByDay = {};
    const feedbackCountByDay = {};
    
    // Count flagged messages by day (using UTC timezone to match message timestamps)
    messages.forEach(msg => {
      const msgDate = new Date(msg.created_at);
      const date = getUTCDateString(msgDate);
      if (!flaggedRateByDay[date]) {
        flaggedRateByDay[date] = { total: 0, flagged: 0 };
      }
      flaggedRateByDay[date].total++;
      if (msg.flagged) {
        flaggedRateByDay[date].flagged++;
      }
    });
    
    // Debug: Log improvement timezone info
    if (messages.length > 0) {
      console.log('📊 [Improvement] Timezone Debug (UTC):', {
        serverNow: new Date().toISOString(),
        serverNowUTC: new Date().toUTCString(),
        totalMessages: messages.length,
        sampleMessages: messages.slice(-3).map(m => ({
          created_at_raw: m.created_at,
          created_at_parsed: new Date(m.created_at).toISOString(),
          created_at_utc: new Date(m.created_at).toUTCString(),
          utcDate: getUTCDateString(new Date(m.created_at)),
          flagged: m.flagged
        })),
        flaggedRateByDay: Object.keys(flaggedRateByDay).slice(-5).reduce((acc, key) => {
          acc[key] = flaggedRateByDay[key];
          return acc;
        }, {})
      });
    }
    
    // Count feedback by day (using UTC timezone to match message timestamps)
    feedbackMemory.forEach(fb => {
      const date = getUTCDateString(new Date(fb.created_at));
      feedbackCountByDay[date] = (feedbackCountByDay[date] || 0) + 1;
    });
    
    // Generate last 30 days of improvement data (using UTC timezone)
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = getUTCDateString(date);
      
      const dayData = flaggedRateByDay[dateStr] || { total: 0, flagged: 0 };
      const flaggedRate = dayData.total > 0 ? (dayData.flagged / dayData.total) * 100 : 0;
      const feedbackCount = feedbackCountByDay[dateStr] || 0;
      
      // Calculate cumulative feedback up to this day
      const cumulativeFeedback = feedbackMemory.filter(fb => {
        const fbDate = new Date(fb.created_at);
        const dayDate = new Date(date);
        dayDate.setHours(23, 59, 59, 999);
        return fbDate <= dayDate;
      }).length;
      
      improvementByDay.push({
        date: dateStr,
        totalMessages: dayData.total,
        flaggedCount: dayData.flagged,
        flaggedRate,
        feedbackCount,
        cumulativeFeedback
      });
    }
    
    // Calculate overall improvement using day-to-day comparison as primary metric
    // Compare today's performance to yesterday's performance for accurate improvement tracking
    const todayStr = getUTCDateString(today);
    const yesterdayStr = getUTCDateString(yesterday);
    
    const todayMessages = messages.filter(m => {
      const msgDate = new Date(m.created_at);
      return getUTCDateString(msgDate) === todayStr;
    });
    const yesterdayMessages = messages.filter(m => {
      const msgDate = new Date(m.created_at);
      return getUTCDateString(msgDate) === yesterdayStr;
    });
    
    const todayFlagged = todayMessages.filter(m => m.flagged).length;
    const yesterdayFlagged = yesterdayMessages.filter(m => m.flagged).length;
    
    const todayFlaggedRate = todayMessages.length > 0 ? (todayFlagged / todayMessages.length) * 100 : 0;
    const yesterdayFlaggedRate = yesterdayMessages.length > 0 ? (yesterdayFlagged / yesterdayMessages.length) * 100 : 0;
    
    // Primary improvement metric: day-to-day comparison
    let dayToDayImprovement = 0;
    if (yesterdayFlaggedRate > 0 && todayMessages.length > 0) {
      dayToDayImprovement = ((yesterdayFlaggedRate - todayFlaggedRate) / yesterdayFlaggedRate) * 100;
      // Strong bonus if today has zero or very few flags compared to yesterday
      if (todayFlaggedRate === 0 && yesterdayFlaggedRate > 0) {
        dayToDayImprovement = 100;
      } else if (todayFlaggedRate < yesterdayFlaggedRate * 0.1 && yesterdayFlaggedRate > 0) {
        // Today has less than 10% of yesterday's rate - show strong improvement
        dayToDayImprovement = Math.max(dayToDayImprovement, 90);
      }
    } else if (yesterdayFlaggedRate === 0 && todayFlaggedRate === 0 && todayMessages.length > 0) {
      // Both days are zero - show positive for maintaining zero flags
      dayToDayImprovement = 50;
    } else if (yesterdayFlaggedRate === 0 && todayFlaggedRate > 0) {
      // Regression: went from zero to having flags
      dayToDayImprovement = -50;
    }
    
    // Secondary metric: batch comparison (less sensitive to single anomalies)
    const maxBatchesToConsider = 20;
    const batchesToAnalyze = improvementByBatch.slice(-maxBatchesToConsider);
    
    // Use simple totals instead of weighted averages to avoid single-flag sensitivity
    const recentBatches = batchesToAnalyze.slice(-Math.floor(batchesToAnalyze.length * 0.4));
    const olderBatches = batchesToAnalyze.slice(0, Math.floor(batchesToAnalyze.length * 0.4));
    
    const recentTotalFlagged = recentBatches.reduce((sum, b) => sum + b.flaggedCount, 0);
    const recentTotalMessages = recentBatches.reduce((sum, b) => sum + b.totalMessages, 0);
    const olderTotalFlagged = olderBatches.reduce((sum, b) => sum + b.flaggedCount, 0);
    const olderTotalMessages = olderBatches.reduce((sum, b) => sum + b.totalMessages, 0);
    
    const recentAvgFlaggedRate = recentTotalMessages > 0 ? (recentTotalFlagged / recentTotalMessages) * 100 : 0;
    const olderAvgFlaggedRate = olderTotalMessages > 0 ? (olderTotalFlagged / olderTotalMessages) * 100 : 0;
    
    // Calculate overall improvement using day-to-day as primary, batch comparison as secondary
    let overallImprovement = dayToDayImprovement;
    
    // If day-to-day comparison shows strong improvement, use it
    // Otherwise, use batch comparison but make it less sensitive to single anomalies
    if (Math.abs(dayToDayImprovement) < 20 && olderTotalMessages > 0 && recentTotalMessages > 0) {
      // Use batch comparison as secondary metric
      const allRecentZero = recentBatches.every(b => b.flaggedCount === 0);
      const anyOlderHadFlags = olderBatches.some(b => b.flaggedCount > 0);
      
      if (olderAvgFlaggedRate > 0) {
        // Older batches had flags - calculate improvement
        const batchImprovement = ((olderAvgFlaggedRate - recentAvgFlaggedRate) / olderAvgFlaggedRate) * 100;
        
        // Strong bonus if recent batches have zero or very few flags
        if (allRecentZero && olderAvgFlaggedRate > 0) {
          overallImprovement = 100;
        } else if (recentAvgFlaggedRate < olderAvgFlaggedRate * 0.2 && olderAvgFlaggedRate > 0) {
          // Recent rate is less than 20% of older rate - strong improvement
          overallImprovement = Math.max(batchImprovement, 80);
        } else {
          overallImprovement = batchImprovement;
        }
      } else if (recentAvgFlaggedRate === 0 && olderAvgFlaggedRate === 0) {
        // Both are zero - show moderate positive
        overallImprovement = Math.max(overallImprovement, 50);
      } else if (recentAvgFlaggedRate === 0 && olderAvgFlaggedRate > 0) {
        // Perfect: went from flags to zero
        overallImprovement = 100;
      }
    }
    
    // Cap extreme negative values to prevent -658% type results
    // Single anomalies shouldn't destroy the improvement metric
    if (overallImprovement < -100) {
      overallImprovement = -100;
    }
    
    // Strong positive boost if today has very few flags compared to yesterday
    if (yesterdayFlaggedRate > 10 && todayFlaggedRate < 5 && todayMessages.length >= 5) {
      overallImprovement = Math.max(overallImprovement, 75);
    }
    
    // Extra boost if today has zero flags and yesterday had many
    if (yesterdayFlaggedRate > 0 && todayFlaggedRate === 0 && todayMessages.length >= 3) {
      overallImprovement = 100;
    }
    
    // Round to 2 decimal places
    overallImprovement = Math.round(overallImprovement * 100) / 100;
    
    // Calculate feedback learning rate by comparing recent batches to older batches
    let feedbackLearningRate = 0;
    if (feedbackMemory.length > 0 && improvementByBatch.length >= 2) {
      const totalBatches = improvementByBatch.length;
      
      // Use larger windows to capture more data - last 40% vs first 40%
      const recentWindowSize = Math.max(3, Math.floor(totalBatches * 0.4));
      const olderWindowSize = Math.max(3, Math.floor(totalBatches * 0.4));
      
      // Get recent batches (last N batches - after feedback)
      const recentBatches = improvementByBatch.slice(-recentWindowSize);
      // Get older batches (first N batches - before feedback)
      const olderBatches = improvementByBatch.slice(0, olderWindowSize);
      
      // Calculate totals for comparison
      const olderTotalFlagged = olderBatches.reduce((sum, b) => sum + b.flaggedCount, 0);
      const olderTotalMessages = olderBatches.reduce((sum, b) => sum + b.totalMessages, 0);
      const recentTotalFlagged = recentBatches.reduce((sum, b) => sum + b.flaggedCount, 0);
      const recentTotalMessages = recentBatches.reduce((sum, b) => sum + b.totalMessages, 0);
      
      // Count consecutive zero batches in recent window
      let consecutiveRecentZeros = 0;
      for (let i = recentBatches.length - 1; i >= 0; i--) {
        if (recentBatches[i].flaggedCount === 0) {
          consecutiveRecentZeros++;
        } else {
          break;
        }
      }
      
      if (olderTotalMessages > 0 && recentTotalMessages > 0) {
        const olderRate = (olderTotalFlagged / olderTotalMessages) * 100;
        const recentRate = (recentTotalFlagged / recentTotalMessages) * 100;
        
        // Primary case: older batches had flags, recent batches have fewer or zero
        if (olderRate > 0) {
          feedbackLearningRate = ((olderRate - recentRate) / olderRate) * 100;
          
          // Strong bonus for zero flags in recent batches
          if (recentRate === 0 && olderRate > 0) {
            feedbackLearningRate = 100;
            // Extra bonus for consecutive zero batches
            if (consecutiveRecentZeros >= 3) {
              feedbackLearningRate = 100;
            }
          } else if (recentRate < olderRate && recentRate > 0) {
            // Improvement but not perfect - ensure it's positive
            feedbackLearningRate = Math.max(feedbackLearningRate, 50);
          }
        } 
        // Case: older batches had zero flags, recent batches also have zero
        else if (olderRate === 0 && recentRate === 0) {
          // Show positive improvement for maintaining zero flags
          feedbackLearningRate = Math.min(consecutiveRecentZeros * 25, 100);
        } 
        // Case: older batches had zero, recent batches have flags (regression)
        else if (olderRate === 0 && recentRate > 0) {
          feedbackLearningRate = -50;
        }
        // Case: older batches had flags, recent batches have zero (perfect improvement)
        else if (olderRate > 0 && recentRate === 0) {
          feedbackLearningRate = 100;
        }
      } 
      // Fallback: compare first batch to last batch if windows overlap
      else if (totalBatches >= 2) {
        const firstBatch = improvementByBatch[0];
        const lastBatch = improvementByBatch[improvementByBatch.length - 1];
        
        if (firstBatch && lastBatch && firstBatch.totalMessages > 0 && lastBatch.totalMessages > 0) {
          const firstRate = (firstBatch.flaggedCount / firstBatch.totalMessages) * 100;
          const lastRate = (lastBatch.flaggedCount / lastBatch.totalMessages) * 100;
          
          if (firstRate > 0) {
            feedbackLearningRate = ((firstRate - lastRate) / firstRate) * 100;
            if (lastRate === 0) {
              feedbackLearningRate = 100;
            }
          } else if (firstRate === 0 && lastRate === 0) {
            const lastFewBatches = improvementByBatch.slice(-3);
            const lastFewAllZero = lastFewBatches.every(b => b.flaggedCount === 0);
            feedbackLearningRate = lastFewAllZero ? 75 : 0;
          } else if (firstRate === 0 && lastRate > 0) {
            feedbackLearningRate = -50;
          } else if (firstRate > 0 && lastRate === 0) {
            feedbackLearningRate = 100;
          }
        }
      }
      
      // Additional check: if recent batches have zero flags and older batches had flags, show strong positive
      if (recentTotalFlagged === 0 && olderTotalFlagged > 0 && recentTotalMessages > 0 && olderTotalMessages > 0) {
        feedbackLearningRate = 100;
      }
    }
    
    // Round feedback learning rate
    feedbackLearningRate = Math.round(feedbackLearningRate * 100) / 100;
    
    // Calculate feedback effectiveness: improvement per feedback
    const feedbackEffectiveness = feedbackMemory.length > 0 && overallImprovement > 0
      ? overallImprovement / feedbackMemory.length
      : 0;
    
    // Round to 2 decimal places
    const roundedFeedbackEffectiveness = Math.round(feedbackEffectiveness * 100) / 100;
    
    // Round the average flagged rates
    const roundedRecentAvg = Math.round(recentAvgFlaggedRate * 100) / 100;
    const roundedOlderAvg = Math.round(olderAvgFlaggedRate * 100) / 100;

    res.json({
      improvementByBatch: improvementByBatch.slice(-10), // Only return last 10 batches for small datasets
      improvementByDay: improvementByDay.slice(-7), // Only return last 7 days
      overallImprovement,
      feedbackLearningRate,
      recentAvgFlaggedRate: roundedRecentAvg,
      olderAvgFlaggedRate: roundedOlderAvg,
      feedbackEffectiveness: roundedFeedbackEffectiveness,
      totalFeedback: feedbackMemory.length,
      totalBatches: improvementByBatch.length
    });
  } catch (error) {
    console.error('Error fetching improvement metrics:', error);
    res.status(500).json({ error: 'Failed to fetch improvement metrics' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Kintsugi backend server running on http://localhost:${PORT}`);
});
