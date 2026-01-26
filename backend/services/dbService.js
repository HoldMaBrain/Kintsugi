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

  async createReview(messageId, adminId, verdict, feedback = null, correctedResponse = null) {
    const { data, error } = await this.supabase
      .from('reviews')
      .insert({
        message_id: messageId,
        admin_id: adminId,
        verdict,
        feedback,
        corrected_response: correctedResponse
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async addFeedbackMemory(issueType, pattern, humanFeedback) {
    const { data, error } = await this.supabase
      .from('feedback_memory')
      .insert({
        issue_type: issueType,
        pattern,
        human_feedback: humanFeedback
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
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

  async deleteConversation(conversationId, userId) {
    const { error } = await this.supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', userId);
    
    if (error) throw error;
  }
}
