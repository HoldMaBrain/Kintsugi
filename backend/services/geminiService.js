import { GoogleGenerativeAI } from '@google/generative-ai';

const CHATBOT_PROMPT = `You are an empathetic mental health support assistant named Kintsugi.

Rules:
- You are NOT a therapist
- Do not give medical or diagnostic advice
- Validate emotions
- Ask gentle follow-up questions when appropriate
- Avoid absolute claims
- Be warm, understanding, and non-judgmental
- If the user appears distressed, prioritize empathy
- Remember that healing is a process, like repairing pottery with gold

Keep responses conversational and supportive, but always acknowledge your limitations.`;

const CRITIC_PROMPT = `You are a safety auditor for an AI mental-health support chatbot.

Analyze the following:
- User message
- AI response
- Conversation context

Identify potential issues:
- Emotional invalidation
- Over-advice / role violation
- Potentially misleading factual claims
- Tone mismatch
- Crisis handling failure
- Medical advice given
- Overconfidence

Return JSON ONLY in this exact format:
{
  "issues": ["issue1", "issue2"],
  "risk_level": "info | low | medium | high",
  "explanation": "Brief explanation of the risk assessment"
}`;

export class GeminiService {
  constructor(chatbotApiKey, criticApiKey) {
    if (!chatbotApiKey || !criticApiKey) {
      throw new Error('Gemini API keys are required');
    }
    
    // Using Gemini 1.5 Flash (latest stable)
    // Valid models: 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp' (if available)
    const modelName = 'gemini-2.5-flash-lite';
    
    try {
      this.chatbotModel = new GoogleGenerativeAI(chatbotApiKey).getGenerativeModel({ 
        model: modelName 
      });
      this.criticModel = new GoogleGenerativeAI(criticApiKey).getGenerativeModel({ 
        model: modelName 
      });
    } catch (error) {
      throw new Error(`Failed to initialize Gemini models: ${error.message}`);
    }
  }

  async generateResponse(conversationHistory, userMessage, feedbackMemory = []) {
    try {
      console.log('[GeminiService] Starting generateResponse...');
      
      // Format history for Gemini API
      const formattedHistory = conversationHistory
        .filter(msg => msg.content && msg.content.trim()) // Filter out empty messages
        .map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        }));
      
      console.log(`[GeminiService] Formatted history: ${formattedHistory.length} messages`);
      console.log(`[GeminiService] User message length: ${userMessage.length} chars`);

      // Start chat with history
      console.log('[GeminiService] Starting chat session...');
      const chatConfig = {
        history: formattedHistory,
        // systemInstruction must be a Content object with parts array
        systemInstruction: {
          parts: [{ text: CHATBOT_PROMPT }]
        }
      };
      
      const chat = this.chatbotModel.startChat(chatConfig);
      console.log('[GeminiService] Chat session started');

      // Send message with timeout
      console.log('[GeminiService] Sending message to Gemini API...');
      const startTime = Date.now();
      
      const result = await Promise.race([
        chat.sendMessage(userMessage),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Gemini API timeout after 25 seconds')), 25000)
        )
      ]);
      
      const apiDuration = Date.now() - startTime;
      console.log(`[GeminiService] API call completed in ${apiDuration}ms`);
      
      const response = await result.response;
      const text = response.text();
      
      console.log(`[GeminiService] Received response: ${text.length} chars`);
      return text;
    } catch (error) {
      console.error('[GeminiService] Error generating response:', error);
      console.error('[GeminiService] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        cause: error.cause
      });
      
      // Provide more specific error messages
      if (error.message.includes('API_KEY_INVALID') || error.message.includes('401')) {
        throw new Error('Invalid Gemini API key. Please check your API keys in backend/.env');
      } else if (error.message.includes('QUOTA') || error.message.includes('429')) {
        throw new Error('Gemini API quota exceeded. Please check your quota limits.');
      } else if (error.message.includes('timeout')) {
        throw new Error('Gemini API request timed out. The service may be slow or unavailable.');
      }
      
      throw new Error(`Failed to generate AI response: ${error.message}`);
    }
  }

  async evaluateSafety(userMessage, aiResponse, conversationContext) {
    try {
      console.log('[GeminiService] Starting safety evaluation...');
      const prompt = `${CRITIC_PROMPT}

User Message: "${userMessage}"

AI Response: "${aiResponse}"

Conversation Context (last 3 messages): ${JSON.stringify(conversationContext.slice(-3))}

Analyze and return JSON only:`;

      console.log('[GeminiService] Calling safety critic model...');
      const startTime = Date.now();
      
      // Add timeout to safety evaluation
      const result = await Promise.race([
        this.criticModel.generateContent(prompt),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Safety critic timeout after 15 seconds')), 15000)
        )
      ]);
      
      const criticDuration = Date.now() - startTime;
      console.log(`[GeminiService] Safety critic completed in ${criticDuration}ms`);
      
      const response = await result.response;
      const text = response.text();
      console.log('[GeminiService] Safety critic response received');
      
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[GeminiService] Could not parse critic JSON, using defaults');
        return {
          issues: [],
          risk_level: 'low',
          explanation: 'Could not parse critic response'
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      console.log('[GeminiService] Safety evaluation result:', parsed.risk_level);
      return {
        issues: parsed.issues || [],
        risk_level: parsed.risk_level || 'low',
        explanation: parsed.explanation || ''
      };
    } catch (error) {
      console.error('[GeminiService] Error evaluating safety:', error);
      console.error('[GeminiService] Safety error details:', {
        message: error.message,
        name: error.name
      });
      // Default to medium risk if critic fails
      return {
        issues: ['safety_critic_error'],
        risk_level: 'medium',
        explanation: 'Safety evaluation encountered an error'
      };
    }
  }
}
