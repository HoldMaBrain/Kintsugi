import { supabase } from './supabase';

// Cache session to avoid multiple simultaneous calls
let sessionCache = null;
let sessionCacheTime = 0;
let sessionPromise = null; // Track ongoing session fetch
const SESSION_CACHE_DURATION = 2000; // 2 second cache

async function getAuthHeaders() {
  try {
    // Use cached session if available and recent
    const now = Date.now();
    if (sessionCache && (now - sessionCacheTime) < SESSION_CACHE_DURATION) {
      return {
        'Content-Type': 'application/json',
        'x-user-email': sessionCache.email,
      };
    }

    // If there's already a session fetch in progress, wait for it
    if (sessionPromise) {
      const result = await sessionPromise;
      if (result) {
        return {
          'Content-Type': 'application/json',
          'x-user-email': result.email,
        };
      }
    }

    // Start new session fetch
    sessionPromise = (async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('🔐 [API] Error getting session:', error);
          throw new Error('Failed to get session');
        }
        
        if (!session || !session.user) {
          console.error('🔐 [API] No session found');
          throw new Error('Not authenticated');
        }
        
        // Cache the session
        sessionCache = { email: session.user.email };
        sessionCacheTime = Date.now();
        
        return { email: session.user.email };
      } catch (err) {
        sessionPromise = null; // Clear promise on error
        throw err;
      } finally {
        // Clear promise after a short delay to allow concurrent calls to use it
        setTimeout(() => {
          sessionPromise = null;
        }, 100);
      }
    })();

    const result = await sessionPromise;
    return {
      'Content-Type': 'application/json',
      'x-user-email': result.email,
    };
  } catch (error) {
    // Clear cache on error
    sessionCache = null;
    sessionCacheTime = 0;
    sessionPromise = null;
    console.error('🔐 [API] Error in getAuthHeaders:', error);
    throw error;
  }
}

export async function getUser() {
  const headers = await getAuthHeaders();
  
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
  
  try {
    const response = await fetch('/api/user', { 
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Failed to get user: ${response.status} ${errorText}`);
    }
    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - backend may not be running');
    }
    throw error;
  }
}

export async function getConversations() {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/conversations', { headers });
  if (!response.ok) throw new Error('Failed to get conversations');
  return response.json();
}

export async function getConversation(id) {
  const headers = await getAuthHeaders();
  
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
  
  try {
    const response = await fetch(`/api/conversations/${id}`, { 
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error('Failed to get conversation');
    }
    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - failed to fetch conversation');
    }
    throw error;
  }
}

export async function createConversation() {
  const headers = await getAuthHeaders();
  
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
  
  try {
    const response = await fetch('/api/conversations', {
      method: 'POST',
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Failed to create conversation: ${response.status} ${errorText}`);
    }
    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - backend may not be running on port 3001');
    }
    throw error;
  }
}

export async function sendMessage(conversationId, message) {
  console.log('📡 [API] sendMessage called:', { conversationId, messageLength: message.length });
  
  const headers = await getAuthHeaders();
  console.log('📡 [API] Auth headers obtained:', { hasEmail: !!headers['x-user-email'] });
  
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error('⏱️ [API] Request timeout triggered (30s)');
    controller.abort();
  }, 30000); // 30 second timeout for AI generation
  
  try {
    console.log('📡 [API] Making fetch request to /api/chat/send');
    const response = await fetch('/api/chat/send', {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, message }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    console.log('📡 [API] Response received:', { 
      status: response.status, 
      statusText: response.statusText,
      ok: response.ok 
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('📡 [API] Response error:', errorData);
      throw new Error(errorData.error || `Failed to send message: ${response.status}`);
    }
    const data = await response.json();
    console.log('📡 [API] Response data received:', { status: data.status, hasMessage: !!data.message });
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('📡 [API] Fetch error:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - AI response is taking too long');
    }
    throw error;
  }
}

export async function deleteConversation(id) {
  const headers = await getAuthHeaders();
  const response = await fetch(`/api/conversations/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) throw new Error('Failed to delete conversation');
  return response.json();
}

export async function getFlaggedMessages() {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/admin/flagged', { headers });
  if (!response.ok) throw new Error('Failed to get flagged messages');
  return response.json();
}

export async function reviewMessage(messageId, verdict, feedback, correctedResponse) {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/admin/review', {
    method: 'POST',
    headers,
    body: JSON.stringify({ messageId, verdict, feedback, correctedResponse }),
  });
  if (!response.ok) throw new Error('Failed to review message');
  return response.json();
}

export async function getMetrics() {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/admin/metrics', { headers });
  if (!response.ok) throw new Error('Failed to get metrics');
  return response.json();
}
