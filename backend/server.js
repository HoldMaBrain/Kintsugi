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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Initialize services
const dbService = new DatabaseService(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const geminiService = new GeminiService(
  process.env.GEMINI_CHATBOT_API_KEY,
  process.env.GEMINI_CRITIC_API_KEY
);

const safetyService = new SafetyService(geminiService);

// Admin email allowlist
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

// Middleware to verify user
async function verifyUser(req, res, next) {
  try {
    const email = req.headers['x-user-email'];
    if (!email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await dbService.getOrCreateUser(email, ADMIN_EMAILS);
    req.user = user;
    next();
  } catch (error) {
    console.error('Error verifying user:', error);
    res.status(500).json({ error: 'Internal server error' });
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
    const conversations = await dbService.getConversations(
      req.user.id,
      req.user.role === 'admin'
    );
    res.json({ conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
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
    const conversation = await dbService.createConversation(req.user.id);
    res.json({ conversation });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Send message
app.post('/api/chat/send', verifyUser, async (req, res) => {
  try {
    const { conversationId, message } = req.body;

    if (!conversationId || !message) {
      return res.status(400).json({ error: 'Missing conversationId or message' });
    }

    // Verify conversation belongs to user
    const conversation = await dbService.getConversation(
      conversationId,
      req.user.id,
      req.user.role === 'admin'
    );

    // Save user message
    await dbService.createMessage(conversationId, 'user', message);

    // Get conversation history
    const history = conversation.messages || [];
    const conversationHistory = history.map(msg => ({
      sender: msg.sender,
      content: msg.content
    }));

    // Get feedback memory
    const feedbackMemory = await dbService.getFeedbackMemory(5);

    // Generate AI response
    const aiResponse = await geminiService.generateResponse(
      conversationHistory,
      message,
      feedbackMemory
    );

    // Evaluate safety
    const safetyResult = await safetyService.evaluateMessage(
      message,
      aiResponse,
      conversationHistory,
      feedbackMemory
    );

    // Save AI message
    const aiMessage = await dbService.createMessage(
      conversationId,
      'ai',
      aiResponse,
      safetyResult.riskLevel,
      safetyResult.flagged
    );

    res.json({
      message: aiMessage,
      status: safetyResult.flagged ? 'pending' : 'delivered',
      riskLevel: safetyResult.riskLevel
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
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
