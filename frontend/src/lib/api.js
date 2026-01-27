import { supabase } from './supabase';

// Cache session to avoid multiple simultaneous calls
let sessionCache = null;
let sessionCacheTime = 0;
let sessionPromise = null; // Track ongoing session fetch
const SESSION_CACHE_DURATION = 2000; // 2 second cache
const SESSION_FETCH_TIMEOUT = 3000; // 3 second timeout for session fetch

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
      try {
        const result = await sessionPromise;
        if (result) {
          return {
            'Content-Type': 'application/json',
            'x-user-email': result.email,
          };
        }
      } catch (err) {
        // If the shared promise failed, we'll try again below
        sessionPromise = null;
      }
    }

    // Start new session fetch with timeout
    sessionPromise = (async () => {
      try {
        // Add timeout to prevent hanging on expired sessions
        const sessionFetch = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session fetch timeout')), SESSION_FETCH_TIMEOUT)
        );
        
        const { data: { session }, error } = await Promise.race([
          sessionFetch,
          timeoutPromise
        ]);
        
        if (error) {
          console.error('🔐 [API] Error getting session:', error);
          throw new Error('Failed to get session: ' + error.message);
        }
        
        if (!session || !session.user) {
          console.error('🔐 [API] No session found - session may have expired');
          // Try to refresh the session
          try {
            const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError || !refreshedSession) {
              throw new Error('Session expired. Please sign in again.');
            }
            // Use refreshed session
            sessionCache = { email: refreshedSession.user.email };
            sessionCacheTime = Date.now();
            return { email: refreshedSession.user.email };
          } catch (refreshErr) {
            throw new Error('Session expired. Please sign in again.');
          }
        }
        
        // Check if session is expired
        const expiresAt = session.expires_at;
        if (expiresAt && expiresAt * 1000 < Date.now()) {
          console.warn('🔐 [API] Session expired, attempting refresh...');
          try {
            const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError || !refreshedSession) {
              throw new Error('Session expired. Please sign in again.');
            }
            sessionCache = { email: refreshedSession.user.email };
            sessionCacheTime = Date.now();
            return { email: refreshedSession.user.email };
          } catch (refreshErr) {
            throw new Error('Session expired. Please sign in again.');
          }
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
    
    // If it's a session expiration error, redirect to login
    if (error.message.includes('expired') || error.message.includes('timeout')) {
      // Clear the session cache and let the auth context handle re-authentication
      window.location.href = '/';
    }
    
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

export async function generateCorrectedResponse(messageId, feedback) {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/admin/generate-corrected-response', {
    method: 'POST',
    headers,
    body: JSON.stringify({ messageId, feedback }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to generate corrected response' }));
    throw new Error(error.error || 'Failed to generate corrected response');
  }
  return response.json();
}

export async function reviewMessage(messageId, verdict, feedback, correctedResponse) {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/admin/review', {
    method: 'POST',
    headers,
    body: JSON.stringify({ messageId, verdict, feedback, correctedResponse }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to review message' }));
    throw new Error(error.error || 'Failed to review message');
  }
  return response.json();
}

export async function getMetrics() {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/admin/metrics', { headers });
  if (!response.ok) throw new Error('Failed to get metrics');
  return response.json();
}

export async function getReviewedMessages() {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/admin/reviewed', { headers });
  if (!response.ok) throw new Error('Failed to get reviewed messages');
  return response.json();
}

export async function getImprovementMetrics() {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/admin/improvement', { headers });
  if (!response.ok) throw new Error('Failed to get improvement metrics');
  return response.json();
}
