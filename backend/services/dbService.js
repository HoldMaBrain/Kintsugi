import { createClient } from '@supabase/supabase-js';

export class DatabaseService {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async getUserByEmail(email) {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('[dbService] Error getting user by email:', {
        email,
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details,
        errorHint: error.hint
      });
      throw error;
    }
    return data;
  }

  async createUser(email, role = 'user') {
    const { data, error } = await this.supabase
      .from('users')
      .insert({ email, role })
      .select()
      .single();
    
    if (error) {
      console.error('[dbService] Error creating user:', {
        email,
        role,
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details,
        errorHint: error.hint
      });
      throw error;
    }
    return data;
  }

  async getOrCreateUser(email, adminEmails) {
    let user = await this.getUserByEmail(email);
    if (!user) {
      const role = adminEmails.includes(email.toLowerCase()) ? 'admin' : 'user';
      user = await this.createUser(email, role);
    } else {
      // Update role if email is in admin list but user role is not admin
      const shouldBeAdmin = adminEmails.includes(email.toLowerCase());
      if (shouldBeAdmin && user.role !== 'admin') {
        console.log(`[dbService] Updating user ${email} to admin role`);
        const { data, error } = await this.supabase
          .from('users')
          .update({ role: 'admin' })
          .eq('id', user.id)
          .select()
          .single();
        if (!error && data) {
          user = data;
        }
      }
    }
    return user;
  }

  async createConversation(userId) {
    const deleteAfter = new Date();
    deleteAfter.setDate(deleteAfter.getDate() + 3); // Auto-delete after 3 days

    const { data, error } = await this.supabase
      .from('conversations')
      .insert({ 
        user_id: userId,
        delete_after: deleteAfter.toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('[dbService] Error creating conversation:', {
        userId,
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details,
        errorHint: error.hint
      });
      throw error;
    }
    return data;
  }

  async getConversations(userId, isAdmin = false) {
    let query = this.supabase
      .from('conversations')
      .select('*, messages(*)')
      .order('created_at', { ascending: false });

    if (!isAdmin) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[dbService] Error fetching conversations:', {
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details
      });
      throw error;
    }
    
    // Log conversation details for debugging
    if (data && data.length > 0) {
      console.log(`[dbService] Found ${data.length} conversations`);
      const firstConv = data[0];
      console.log(`[dbService] First conversation:`, {
        id: firstConv.id,
        messageCount: firstConv.messages?.length || 0,
        hasMessages: !!firstConv.messages
      });
    }
    
    return data || [];
  }

  async getConversation(conversationId, userId, isAdmin = false) {
    let query = this.supabase
      .from('conversations')
      .select('*, messages(*)')
      .eq('id', conversationId);

    if (!isAdmin) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.single();
    if (error) throw error;
    return data;
  }

  async createMessage(conversationId, sender, content, riskLevel = 'info', flagged = false) {
    const { data, error } = await this.supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender,
        content,
        risk_level: riskLevel,
        flagged,
        finalized: !flagged
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateMessage(messageId, updates) {
    const { data, error } = await this.supabase
      .from('messages')
      .update(updates)
      .eq('id', messageId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getFlaggedMessages() {
    const { data, error } = await this.supabase
      .from('messages')
      .select(`
        *,
        conversations(
          *,
          users(*),
          messages(*)
        )
      `)
      .eq('flagged', true)
      .eq('finalized', false)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }

  async createReview(messageId, adminId, verdict, feedback = null, correctedResponse = null, originalResponse = null) {
    try {
      // Try to insert with all columns
      const { data, error } = await this.supabase
        .from('reviews')
        .insert({
          message_id: messageId,
          admin_id: adminId,
          verdict,
          feedback,
          corrected_response: correctedResponse,
          original_response: originalResponse
        })
        .select(`
          *,
          users!reviews_admin_id_fkey(*)
        `)
        .single();
      
      if (error) {
        // If original_response column doesn't exist, try without it
        if (error.code === '42703' || error.message.includes('original_response') || error.message.includes('does not exist')) {
          console.warn('[dbService] original_response column may not exist, storing without it:', error.message);
          const { data: fallbackData, error: fallbackError } = await this.supabase
            .from('reviews')
            .insert({
              message_id: messageId,
              admin_id: adminId,
              verdict,
              feedback,
              corrected_response: correctedResponse
            })
            .select(`
              *,
              users!reviews_admin_id_fkey(*)
            `)
            .single();
          
          if (fallbackError) throw fallbackError;
          return fallbackData;
        }
        throw error;
      }
      return data;
    } catch (error) {
      console.error('[dbService] Error creating review:', error);
      throw error;
    }
  }

  async addFeedbackMemory(issueType, userPrompt, humanFeedback, unsafeResponse = null, correctedResponse = null) {
    try {
      // Try to insert with all columns
      const { data, error } = await this.supabase
        .from('feedback_memory')
        .insert({
          issue_type: issueType,
          pattern: userPrompt, // Store the user prompt/pattern
          human_feedback: humanFeedback,
          unsafe_response: unsafeResponse, // Store the unsafe AI response
          corrected_response: correctedResponse // Store the corrected response
        })
        .select()
        .single();
      
      if (error) {
        // If columns don't exist, try without them
        if (error.code === '42703' || error.message.includes('column') || error.message.includes('does not exist')) {
          console.warn('[dbService] Feedback memory columns may not exist, storing without them:', error.message);
          const { data: fallbackData, error: fallbackError } = await this.supabase
            .from('feedback_memory')
            .insert({
              issue_type: issueType,
              pattern: userPrompt,
              human_feedback: humanFeedback
            })
            .select()
            .single();
          
          if (fallbackError) throw fallbackError;
          return fallbackData;
        }
        throw error;
      }
      return data;
    } catch (error) {
      console.error('[dbService] Error adding feedback memory:', error);
      throw error;
    }
  }

  async getFeedbackMemory(limit = 10) {
    const { data, error } = await this.supabase
      .from('feedback_memory')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  }

  async getReviewedMessages() {
    // Get messages that have been reviewed (have a review record)
    const { data: reviews, error: reviewsError } = await this.supabase
      .from('reviews')
      .select(`
        *,
        messages!inner(
          *,
          conversations(
            *,
            users(*),
            messages(*)
          )
        ),
        users!reviews_admin_id_fkey(*)
      `)
      .order('created_at', { ascending: false });
    
    if (reviewsError) throw reviewsError;
    
    // Transform to return messages with their reviews
    const messages = (reviews || []).map(review => ({
      ...review.messages,
      reviews: [{
        ...review,
        users: review.users
      }]
    }));
    
    return messages || [];
  }

  async deleteConversation(conversationId, userId) {
    const { error } = await this.supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', userId);
    
    if (error) throw error;
  }
}
