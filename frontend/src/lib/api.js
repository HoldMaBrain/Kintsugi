import { supabase } from './supabase';

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }
  return {
    'Content-Type': 'application/json',
    'x-user-email': session.user.email,
  };
}

export async function getUser() {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/user', { headers });
  if (!response.ok) throw new Error('Failed to get user');
  return response.json();
}

export async function getConversations() {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/conversations', { headers });
  if (!response.ok) throw new Error('Failed to get conversations');
  return response.json();
}

export async function getConversation(id) {
  const headers = await getAuthHeaders();
  const response = await fetch(`/api/conversations/${id}`, { headers });
  if (!response.ok) throw new Error('Failed to get conversation');
  return response.json();
}

export async function createConversation() {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/conversations', {
    method: 'POST',
    headers,
  });
  if (!response.ok) throw new Error('Failed to create conversation');
  return response.json();
}

export async function sendMessage(conversationId, message) {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/chat/send', {
    method: 'POST',
    headers,
    body: JSON.stringify({ conversationId, message }),
  });
  if (!response.ok) throw new Error('Failed to send message');
  return response.json();
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
