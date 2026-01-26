import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, Trash2, LogOut, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createConversation, sendMessage, getConversation, deleteConversation, getConversations } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

export default function Chat() {
  const { user, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingMessage, setPendingMessage] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    // Wait for auth to finish loading before checking user
    if (user === null && !authLoading) {
      navigate('/');
      return;
    }
    if (user) {
      initializeConversation();
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingMessage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  async function initializeConversation() {
    try {
      // First, try to get existing conversations
      const { conversations } = await getConversations();
      
      if (conversations && conversations.length > 0) {
        // Load the most recent conversation
        const mostRecent = conversations[0]; // Already sorted by created_at desc
        console.log('📋 [Chat] Most recent conversation:', {
          id: mostRecent.id,
          messageCount: mostRecent.messages?.length || 0,
          hasMessages: !!mostRecent.messages,
          messages: mostRecent.messages
        });
        
        setConversationId(mostRecent.id);
        
        // Load messages from the conversation
        if (mostRecent.messages && mostRecent.messages.length > 0) {
          // Sort messages by created_at to ensure correct order
          const sortedMessages = [...mostRecent.messages].sort((a, b) => 
            new Date(a.created_at) - new Date(b.created_at)
          );
          console.log('📋 [Chat] Setting messages:', sortedMessages.length);
          setMessages(sortedMessages);
        } else {
          // If messages aren't loaded, fetch the full conversation
          console.log('📋 [Chat] No messages in response, fetching full conversation...');
          try {
            const { conversation } = await getConversation(mostRecent.id);
            if (conversation.messages && conversation.messages.length > 0) {
              const sortedMessages = [...conversation.messages].sort((a, b) => 
                new Date(a.created_at) - new Date(b.created_at)
              );
              console.log('📋 [Chat] Loaded messages from full fetch:', sortedMessages.length);
              setMessages(sortedMessages);
            } else {
              setMessages([]);
            }
          } catch (fetchError) {
            console.error('📋 [Chat] Error fetching full conversation:', fetchError);
            setMessages([]);
          }
        }
        console.log(`✅ Loaded existing conversation with ${mostRecent.messages?.length || 0} messages`);
      } else {
        // No existing conversations, create a new one
        const { conversation } = await createConversation();
        setConversationId(conversation.id);
        setMessages([]);
        console.log('✅ Created new conversation');
      }
    } catch (error) {
      console.error('Error initializing conversation:', error);
      const errorMessage = error.message || 'Failed to initialize conversation';
      toast({
        title: 'Error',
        description: errorMessage.includes('timeout') || errorMessage.includes('Failed to fetch')
          ? 'Backend server may not be running. Please start the backend server on port 3001.'
          : errorMessage,
        variant: 'destructive',
      });
    }
  }

  async function handleSend() {
    if (!input.trim() || sending || !conversationId) {
      console.warn('⚠️ [Chat] Cannot send message:', { hasInput: !!input.trim(), sending, hasConversationId: !!conversationId });
      return;
    }

    const userMessage = input.trim();
    setInput('');
    setSending(true);

    // Add user message immediately
    const newUserMessage = {
      id: `temp-${Date.now()}`,
      sender: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newUserMessage]);

    // Safety timeout to ensure sending state is reset
    const safetyTimeout = setTimeout(() => {
      console.error('⚠️ [Chat] Safety timeout triggered - resetting sending state');
      setSending(false);
    }, 35000); // 35 seconds (slightly longer than the API timeout)

    try {
      console.log('📤 [Chat] Sending message:', { conversationId, messageLength: userMessage.length });
      console.log('📤 [Chat] Sending state set to true');
      
      const response = await sendMessage(conversationId, userMessage);
      clearTimeout(safetyTimeout);
      console.log('✅ [Chat] Message response received:', { status: response.status, messageId: response.message?.id });
      
      if (response.status === 'pending') {
        // Message flagged - show placeholder
        setPendingMessage({
          id: response.message.id,
          content: response.message.content,
          riskLevel: response.riskLevel,
        });
        setMessages((prev) => [...prev, {
          id: response.message.id,
          sender: 'ai',
          content: 'Let me think about this more deeply…',
          created_at: new Date().toISOString(),
          flagged: true,
          risk_level: response.riskLevel,
        }]);
      } else {
        // Message delivered
        setMessages((prev) => [...prev, {
          id: response.message.id,
          sender: 'ai',
          content: response.message.content,
          created_at: response.message.created_at,
          risk_level: response.riskLevel,
        }]);
      }

      // Refresh conversation to get updated messages (with timeout protection)
      try {
        const { conversation } = await getConversation(conversationId);
        setMessages(conversation.messages || []);
        setPendingMessage(null);
      } catch (refreshError) {
        console.warn('Could not refresh conversation, using response data:', refreshError);
        // Continue anyway - we already have the message from the response
        // The messages are already updated from the response above
      }
    } catch (error) {
      clearTimeout(safetyTimeout);
      console.error('❌ [Chat] Error sending message:', error);
      console.error('❌ [Chat] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      toast({
        title: 'Error',
        description: error.message || 'Failed to send message. Please try again.',
        variant: 'destructive',
      });
      // Remove the user message on error
      setMessages((prev) => prev.filter(m => m.id !== newUserMessage.id));
    } finally {
      // Always reset sending state, even if there were errors
      clearTimeout(safetyTimeout);
      setSending(false);
      console.log('✅ [Chat] Sending state reset in finally block');
    }
  }

  async function handleDeleteConversation() {
    if (!conversationId) return;
    try {
      await deleteConversation(conversationId);
      await initializeConversation();
      toast({
        title: 'Success',
        description: 'Conversation deleted',
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete conversation',
        variant: 'destructive',
      });
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  const getRiskBadgeVariant = (riskLevel) => {
    switch (riskLevel) {
      case 'high': return 'danger';
      case 'medium': return 'warning';
      case 'low': return 'success';
      default: return 'secondary';
    }
  };

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-gold-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-amber-50 via-white to-gold-50">
      {/* Header */}
      <div className="border-b bg-white/80 backdrop-blur-sm shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-gold-600 to-gold-500 bg-clip-text text-transparent">
              Kintsugi
            </h1>
            {user?.role === 'admin' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/admin')}
              >
                Admin Dashboard
              </Button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Avatar>
                <AvatarFallback>
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground">{user?.email}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto container mx-auto px-4 py-6 max-w-4xl">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mb-6 flex gap-4 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.sender === 'ai' && (
                <Avatar className="h-8 w-8 border-2 border-gold-300">
                  <AvatarFallback className="bg-gold-100 text-gold-700">AI</AvatarFallback>
                </Avatar>
              )}
              <div className={`max-w-[80%] ${message.sender === 'user' ? 'order-2' : ''}`}>
                <Card className={`p-4 ${message.sender === 'user' ? 'bg-gold-50 border-gold-200' : 'bg-white'}`}>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  {message.risk_level && message.risk_level !== 'info' && (
                    <Badge variant={getRiskBadgeVariant(message.risk_level)} className="mt-2">
                      {message.risk_level.toUpperCase()}
                    </Badge>
                  )}
                  {message.flagged && (
                    <Badge variant="warning" className="mt-2 ml-2">
                      Under Review
                    </Badge>
                  )}
                </Card>
              </div>
              {message.sender === 'user' && (
                <Avatar className="h-8 w-8 border-2 border-gold-300">
                  <AvatarFallback className="bg-blue-100 text-blue-700">You</AvatarFallback>
                </Avatar>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {pendingMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6 flex gap-4 justify-start"
          >
            <Avatar className="h-8 w-8 border-2 border-gold-300">
              <AvatarFallback className="bg-gold-100 text-gold-700">AI</AvatarFallback>
            </Avatar>
            <Card className="p-4 bg-white border-2 border-gold-300">
              <p className="text-sm text-muted-foreground italic">
                This response is being reviewed by our safety team to ensure it meets our standards.
              </p>
            </Card>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 max-w-4xl">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Share what's on your mind..."
                className="min-h-[60px] resize-none"
                disabled={sending}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDeleteConversation}
                title="Delete conversation"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                variant="gold"
                size="icon"
                onClick={handleSend}
                disabled={sending || !input.trim()}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
