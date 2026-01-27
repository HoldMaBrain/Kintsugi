import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, Trash2, LogOut, User, Heart, Flower2, Leaf, Sparkles, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createConversation, sendMessage, getConversation, deleteConversation, getConversations } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import ReactMarkdown from 'react-markdown';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function Chat() {
  const { user, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingMessage, setPendingMessage] = useState(null);
  const [unblurredMessages, setUnblurredMessages] = useState(new Set()); // Track which messages user has unblurred
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const initializingRef = useRef(false); // Prevent multiple simultaneous initializations

  useEffect(() => {
    // Wait for auth to finish loading before checking user
    if (user === null && !authLoading) {
      navigate('/');
      return;
    }
    // Only initialize once when user is available and not already initializing
    // Use a ref to track if we've already initialized for this user
    if (user && !initializingRef.current) {
      initializingRef.current = true;
      initializeConversation().finally(() => {
        // Reset after a short delay to allow re-initialization if needed
        setTimeout(() => {
          initializingRef.current = false;
        }, 1000);
      });
    }
  }, [user, authLoading, navigate]); // Only depend on user/authLoading, not conversationId

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
        
        // Only update if conversation ID changed to prevent unnecessary re-renders
        if (mostRecent.id !== conversationId) {
          setConversationId(mostRecent.id);
          
          // Load messages from the conversation
          if (mostRecent.messages && mostRecent.messages.length > 0) {
            // Sort messages by created_at to ensure correct order
            const sortedMessages = [...mostRecent.messages].sort((a, b) => 
              new Date(a.created_at) - new Date(b.created_at)
            );
            setMessages(sortedMessages);
            
            // Initialize unblurred state
            setUnblurredMessages(new Set());
            
            console.log(`✅ Loaded existing conversation with ${sortedMessages.length} messages`);
          } else {
            // If messages aren't loaded, fetch the full conversation
            try {
              const { conversation } = await getConversation(mostRecent.id);
              if (conversation.messages && conversation.messages.length > 0) {
                const sortedMessages = [...conversation.messages].sort((a, b) => 
                  new Date(a.created_at) - new Date(b.created_at)
                );
                setMessages(sortedMessages);
                
                // Initialize unblurred state - only track messages that are flagged but not finalized
                setUnblurredMessages(new Set());
                
                console.log(`✅ Loaded conversation with ${sortedMessages.length} messages`);
              } else {
                setMessages([]);
                setUnblurredMessages(new Set());
              }
            } catch (fetchError) {
              console.error('📋 [Chat] Error fetching full conversation:', fetchError);
              setMessages([]);
            }
          }
        }
      } else {
        // No existing conversations, create a new one
        if (!conversationId) {
          const { conversation } = await createConversation();
          setConversationId(conversation.id);
          setMessages([]);
          console.log('✅ Created new conversation');
        }
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
        const refreshedMessages = conversation.messages || [];
        setMessages(refreshedMessages);
        
        // Preserve unblurred state for messages that are still flagged but not finalized
        // If a message is now finalized (reviewed), it will show normally regardless
        setUnblurredMessages(prev => {
          const newSet = new Set(prev);
          // Remove messages that are now finalized (they don't need to be tracked)
          refreshedMessages.forEach(msg => {
            if (msg.finalized) {
              newSet.delete(msg.id);
            }
          });
          return newSet;
        });
        
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
      
      // Check if it's a session expiration error
      if (error.message.includes('expired') || error.message.includes('timeout') || error.message.includes('Not authenticated')) {
        toast({
          title: 'Session Expired',
          description: 'Your session has expired. Please sign in again.',
          variant: 'destructive',
        });
        // Redirect to landing page after a short delay
        setTimeout(() => {
          navigate('/');
        }, 2000);
      } else {
        toast({
          title: 'Error',
          description: error.message || 'Failed to send message. Please try again.',
          variant: 'destructive',
        });
      }
      
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

  // Floating elements for the chat page
  const floatingElements = [
    { icon: Heart, color: "text-rose-300", size: "w-10 h-10", delay: 0, duration: 8, x: "3%", y: "15%" },
    { icon: Flower2, color: "text-purple-300", size: "w-8 h-8", delay: 1, duration: 10, x: "92%", y: "25%" },
    { icon: Leaf, color: "text-green-300", size: "w-9 h-9", delay: 2, duration: 9, x: "5%", y: "60%" },
    { icon: Sparkles, color: "text-amber-300", size: "w-7 h-7", delay: 0.5, duration: 11, x: "94%", y: "50%" },
    { icon: Heart, color: "text-pink-300", size: "w-8 h-8", delay: 1.5, duration: 8, x: "2%", y: "80%" },
    { icon: Flower2, color: "text-rose-200", size: "w-9 h-9", delay: 2.5, duration: 10, x: "96%", y: "70%" },
  ];

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-gold-50 relative overflow-hidden">
        {/* Animated background particles */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(15)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-gold-400/30 rounded-full"
              initial={{
                x: typeof window !== 'undefined' ? Math.random() * window.innerWidth : Math.random() * 1920,
                y: typeof window !== 'undefined' ? Math.random() * window.innerHeight : Math.random() * 1080,
                scale: 0,
              }}
              animate={{
                y: [null, typeof window !== 'undefined' ? Math.random() * window.innerHeight : Math.random() * 1080],
                scale: [0, 1, 0],
                opacity: [0, 0.5, 0],
              }}
              transition={{
                duration: Math.random() * 3 + 2,
                repeat: Infinity,
                delay: Math.random() * 2,
              }}
            />
          ))}
        </div>
        <div className="text-center relative z-10">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="rounded-full h-16 w-16 border-4 border-gold-600 border-t-transparent mx-auto"
          />
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-4 text-muted-foreground"
          >
            Loading...
          </motion.p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div className="h-screen flex flex-col bg-gradient-to-br from-amber-50 via-white to-gold-50 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Floating gold particles - reduced count for performance */}
        {[...Array(10)].map((_, i) => (
          <motion.div
            key={`particle-${i}`}
            className="absolute w-1 h-1 bg-gold-400/40 rounded-full"
            style={{
              transform: 'translateZ(0)', // GPU acceleration
            }}
            initial={{
              x: typeof window !== 'undefined' ? Math.random() * window.innerWidth : Math.random() * 1920,
              y: typeof window !== 'undefined' ? Math.random() * window.innerHeight : Math.random() * 1080,
            }}
            animate={{
              y: [null, (Math.random() - 0.5) * 200],
              x: [null, (Math.random() - 0.5) * 200],
              opacity: [0.2, 0.5, 0.2],
            }}
            transition={{
              duration: Math.random() * 8 + 6,
              repeat: Infinity,
              delay: Math.random() * 3,
              ease: [0.4, 0, 0.6, 1],
            }}
          />
        ))}
        
        {/* Mental health themed floating elements with hover glow */}
        {floatingElements.map((element, i) => {
          const Icon = element.icon;
          return (
            <motion.div
              key={`floating-${i}`}
              className={`absolute ${element.size} ${element.color} opacity-20 cursor-pointer group`}
              style={{
                left: element.x,
                top: element.y,
                transform: 'translateZ(0)', // GPU acceleration
              }}
              animate={{
                y: [null, -15, 15, -10, 10, 0],
                x: [null, -5, 5, -3, 3, 0],
                rotate: [0, 2, -2, 1, -1, 0],
                opacity: [0.15, 0.25, 0.2, 0.22, 0.18, 0.2],
              }}
              transition={{
                duration: element.duration * 1.5,
                repeat: Infinity,
                delay: element.delay,
                ease: [0.4, 0, 0.6, 1],
              }}
              whileHover={{
                scale: 1.3,
                opacity: 0.6,
                transition: { duration: 0.3 },
              }}
            >
              <Icon className="w-full h-full drop-shadow-lg group-hover:drop-shadow-[0_0_20px_currentColor] transition-all duration-300" />
              {/* Glow effect on hover */}
              <motion.div
                className="absolute inset-0 rounded-full blur-xl opacity-0 group-hover:opacity-50 transition-opacity duration-300 pointer-events-none"
                style={{
                  backgroundColor: 'currentColor',
                  transform: 'translateZ(0)',
                }}
              />
            </motion.div>
          );
        })}
        
        {/* Large decorative gradient orbs - optimized for performance */}
        <motion.div
          className="absolute -top-40 -right-40 w-96 h-96 bg-gold-200/15 rounded-full blur-3xl"
          style={{
            willChange: 'transform, opacity',
            transform: 'translateZ(0)', // GPU acceleration
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.35, 0.2],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: [0.4, 0, 0.6, 1],
          }}
        />
        <motion.div
          className="absolute -bottom-40 -left-40 w-96 h-96 bg-amber-200/15 rounded-full blur-3xl"
          style={{
            willChange: 'transform, opacity',
            transform: 'translateZ(0)', // GPU acceleration
          }}
          animate={{
            scale: [1, 1.25, 1],
            opacity: [0.2, 0.35, 0.2],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: [0.4, 0, 0.6, 1],
            delay: 2,
          }}
        />
      </div>
      {/* Header with glass morphism */}
      <div className="relative z-10 border-b border-gold-200/50 bg-white/40 backdrop-blur-xl shadow-lg shadow-gold-200/20">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.h1 
              className="text-2xl font-bold bg-gradient-to-r from-gold-600 via-gold-500 to-gold-700 bg-clip-text text-transparent"
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.2 }}
            >
              Kintsugi
            </motion.h1>
            {user?.role === 'admin' && (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/admin')}
                  className="bg-white/60 backdrop-blur-sm border-gold-300/50 hover:bg-white/80 hover:shadow-md hover:shadow-gold-300/30 transition-all"
                >
                  Admin Dashboard
                </Button>
              </motion.div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-white/50 backdrop-blur-sm px-3 py-1.5 rounded-full border border-gold-200/50">
              <Avatar className="h-7 w-7 border border-gold-300/50">
                <AvatarFallback className="bg-gold-100/80 text-gold-700">
                  <User className="h-3.5 w-3.5" />
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-gray-700 font-medium">{user?.email}</span>
            </div>
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleSignOut}
                className="bg-white/50 backdrop-blur-sm border border-gold-200/50 hover:bg-white/80 hover:shadow-md hover:shadow-gold-300/30"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto container mx-auto px-4 py-6 max-w-4xl relative z-10">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className={`mb-6 flex gap-4 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.sender === 'ai' && (
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.2 }}
                >
                  <Avatar className="h-8 w-8 border-2 border-gold-300/70 shadow-md shadow-gold-300/30">
                    <AvatarFallback className="bg-gradient-to-br from-gold-100 to-gold-50 text-gold-700 font-semibold">AI</AvatarFallback>
                  </Avatar>
                </motion.div>
              )}
              <div className={`max-w-[80%] ${message.sender === 'user' ? 'order-2' : ''}`}>
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className={`p-4 backdrop-blur-xl border-2 ${
                    message.sender === 'user' 
                      ? 'bg-gradient-to-br from-gold-50/90 to-gold-100/80 border-gold-300/60 shadow-lg shadow-gold-300/20' 
                      : message.flagged && !message.finalized
                        ? 'bg-amber-50/80 border-amber-300/60 shadow-lg shadow-amber-300/20'
                        : 'bg-white/80 border-gold-200/50 shadow-lg shadow-gold-200/10'
                  }`}>
                  {/* Check if message should be blurred: flagged but not finalized (reviewed) */}
                  {message.sender === 'ai' && message.flagged && !message.finalized && !unblurredMessages.has(message.id) ? (
                    <div className="space-y-3">
                      {/* Warning message */}
                      <div className="flex items-start gap-2 p-3 bg-amber-100/50 border border-amber-300/50 rounded-lg">
                        <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-amber-800 mb-1">Content Warning</p>
                          <p className="text-xs text-amber-700">
                            This response has been flagged as potentially harmful or inconsiderate and is under review.
                          </p>
                        </div>
                      </div>
                      
                      {/* Blurred content */}
                      <div className="relative">
                        <div className="blur-sm select-none pointer-events-none">
                          <div className="text-sm prose prose-sm max-w-none">
                            <ReactMarkdown
                              components={{
                                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                                li: ({ children }) => <li className="ml-2">{children}</li>,
                                strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                                em: ({ children }) => <em className="italic">{children}</em>,
                                h1: ({ children }) => <h3 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h3>,
                                h2: ({ children }) => <h4 className="text-sm font-semibold mb-1.5 mt-2.5 first:mt-0">{children}</h4>,
                                h3: ({ children }) => <h5 className="text-sm font-medium mb-1 mt-2 first:mt-0">{children}</h5>,
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                        
                        {/* Unblur button overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-amber-50/80 backdrop-blur-sm rounded-lg">
                          <motion.div
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setUnblurredMessages(prev => new Set([...prev, message.id]));
                              }}
                              className="bg-white/90 backdrop-blur-sm border-2 border-amber-400/70 hover:bg-white hover:border-amber-500 shadow-md"
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Content
                            </Button>
                          </motion.div>
                        </div>
                      </div>
                      
                      {message.risk_level && message.risk_level !== 'info' && (
                        <TooltipProvider>
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <div className="mt-2 inline-block">
                                <Badge variant={getRiskBadgeVariant(message.risk_level)} className="cursor-help">
                                  {message.risk_level.toUpperCase()}
                                </Badge>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-semibold mb-1 text-gold-700">
                                {message.risk_level === 'high' ? 'High Risk' : message.risk_level === 'medium' ? 'Medium Risk' : 'Low Risk'}
                              </p>
                              <p className="text-xs leading-relaxed">
                                {message.risk_level === 'high' 
                                  ? 'This response has been flagged for potential safety concerns. It may contain harmful, inconsiderate, or disconnected content that requires review.'
                                  : message.risk_level === 'medium'
                                  ? 'This response has been flagged with moderate safety concerns. It may need additional review to ensure it meets our standards.'
                                  : 'This response has been flagged with minor safety concerns. It has been reviewed and approved.'}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <Badge variant="warning" className="mt-2 ml-2">
                        Under Review
                      </Badge>
                    </div>
                  ) : message.sender === 'ai' && message.flagged && !message.finalized && unblurredMessages.has(message.id) ? (
                    // Unblurred but still under review
                    <div className="space-y-3">
                      <div className="flex items-start gap-2 p-2 bg-amber-100/50 border border-amber-300/50 rounded-lg">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700">
                          This response is under review. Content shown at your discretion.
                        </p>
                      </div>
                      <div className="text-sm prose prose-sm max-w-none">
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                            ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                            li: ({ children }) => <li className="ml-2">{children}</li>,
                            strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                            em: ({ children }) => <em className="italic">{children}</em>,
                            h1: ({ children }) => <h3 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h3>,
                            h2: ({ children }) => <h4 className="text-sm font-semibold mb-1.5 mt-2.5 first:mt-0">{children}</h4>,
                            h3: ({ children }) => <h5 className="text-sm font-medium mb-1 mt-2 first:mt-0">{children}</h5>,
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                      {message.risk_level && message.risk_level !== 'info' && (
                        <TooltipProvider>
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <div className="mt-2 inline-block">
                                <Badge variant={getRiskBadgeVariant(message.risk_level)} className="cursor-help">
                                  {message.risk_level.toUpperCase()}
                                </Badge>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-semibold mb-1 text-gold-700">
                                {message.risk_level === 'high' ? 'High Risk' : message.risk_level === 'medium' ? 'Medium Risk' : 'Low Risk'}
                              </p>
                              <p className="text-xs leading-relaxed">
                                {message.risk_level === 'high' 
                                  ? 'This response has been flagged for potential safety concerns. It may contain harmful, inconsiderate, or disconnected content that requires review.'
                                  : message.risk_level === 'medium'
                                  ? 'This response has been flagged with moderate safety concerns. It may need additional review to ensure it meets our standards.'
                                  : 'This response has been flagged with minor safety concerns. It has been reviewed and approved.'}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <Badge variant="warning" className="mt-2 ml-2">
                        Under Review
                      </Badge>
                    </div>
                  ) : message.sender === 'ai' ? (
                    // Normal AI message (not flagged or already reviewed)
                    <div className="text-sm prose prose-sm max-w-none">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                          li: ({ children }) => <li className="ml-2">{children}</li>,
                          strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                          em: ({ children }) => <em className="italic">{children}</em>,
                          h1: ({ children }) => <h3 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h3>,
                          h2: ({ children }) => <h4 className="text-sm font-semibold mb-1.5 mt-2.5 first:mt-0">{children}</h4>,
                          h3: ({ children }) => <h5 className="text-sm font-medium mb-1 mt-2 first:mt-0">{children}</h5>,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  )}
                  {message.risk_level && message.risk_level !== 'info' && message.sender === 'ai' && (!message.flagged || message.finalized) && (
                    <TooltipProvider>
                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <div className="mt-2 inline-block">
                            <Badge variant={getRiskBadgeVariant(message.risk_level)} className="cursor-help">
                              {message.risk_level.toUpperCase()}
                            </Badge>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-semibold mb-1 text-gold-700">
                            {message.risk_level === 'high' ? 'High Risk' : message.risk_level === 'medium' ? 'Medium Risk' : 'Low Risk'}
                          </p>
                          <p className="text-xs leading-relaxed">
                            {message.risk_level === 'high' 
                              ? 'This response has been flagged for potential safety concerns. It may contain harmful, inconsiderate, or disconnected content that requires review.'
                              : message.risk_level === 'medium'
                              ? 'This response has been flagged with moderate safety concerns. It may need additional review to ensure it meets our standards.'
                              : 'This response has been flagged with minor safety concerns. It has been reviewed and approved.'}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  </Card>
                </motion.div>
              </div>
              {message.sender === 'user' && (
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.2 }}
                >
                  <Avatar className="h-8 w-8 border-2 border-gold-300/70 shadow-md shadow-gold-300/30">
                    <AvatarFallback className="bg-gradient-to-br from-blue-100 to-blue-50 text-blue-700 font-semibold">You</AvatarFallback>
                  </Avatar>
                </motion.div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {pendingMessage && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 flex gap-4 justify-start"
          >
            <Avatar className="h-8 w-8 border-2 border-gold-300/70 shadow-md shadow-gold-300/30">
              <AvatarFallback className="bg-gradient-to-br from-gold-100 to-gold-50 text-gold-700 font-semibold">AI</AvatarFallback>
            </Avatar>
            <Card className="p-4 bg-white/80 backdrop-blur-xl border-2 border-gold-300/60 shadow-lg shadow-gold-300/20">
              <p className="text-sm text-muted-foreground italic">
                This response is being reviewed by our safety team to ensure it meets our standards.
              </p>
            </Card>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input with glass morphism */}
      <div className="relative z-10 border-t border-gold-200/50 bg-white/40 backdrop-blur-xl shadow-lg shadow-gold-200/20">
        <div className="container mx-auto px-4 py-4 max-w-4xl">
          <div className="flex gap-4 items-end">
            <div className="flex-1 relative">
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
                className="min-h-[60px] resize-none bg-white/70 backdrop-blur-sm border-2 border-gold-200/50 focus:border-gold-400/70 focus:ring-2 focus:ring-gold-300/30 shadow-md shadow-gold-200/10 transition-all"
                disabled={sending}
              />
              {/* Glow effect on focus */}
              <div className="absolute inset-0 pointer-events-none rounded-md opacity-0 focus-within:opacity-100 transition-opacity duration-300 blur-xl bg-gold-300/20 -z-10" />
            </div>
            <div className="flex gap-2">
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDeleteConversation}
                  title="Delete conversation"
                  className="bg-white/60 backdrop-blur-sm border border-gold-200/50 hover:bg-white/80 hover:shadow-md hover:shadow-gold-300/30 transition-all"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </motion.div>
              <motion.div 
                whileHover={{ scale: 1.05 }} 
                whileTap={{ scale: 0.95 }}
                className="relative"
              >
                <Button
                  variant="gold"
                  size="icon"
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  className="bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 shadow-lg shadow-gold-500/40 hover:shadow-xl hover:shadow-gold-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
                {/* Glow effect */}
                {!sending && input.trim() && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-gold-400/40 blur-md -z-10"
                    animate={{
                      opacity: [0.5, 0.8, 0.5],
                      scale: [1, 1.2, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                )}
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}
