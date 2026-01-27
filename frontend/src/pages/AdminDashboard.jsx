import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Shield, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, MessageSquare, BarChart3, Eye, Sparkles, Heart, Flower2, Leaf, Brain, ArrowDown, ArrowUp, BookOpen, Info, RefreshCw, TrendingUp as TrendingUpIcon, LineChart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getFlaggedMessages, reviewMessage, getMetrics, getReviewedMessages, generateCorrectedResponse, getImprovementMetrics } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [flaggedMessages, setFlaggedMessages] = useState([]);
  const [reviewedMessages, setReviewedMessages] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [improvementMetrics, setImprovementMetrics] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [verdict, setVerdict] = useState('safe');
  const [feedback, setFeedback] = useState('');
  const [correctedResponse, setCorrectedResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatingResponse, setGeneratingResponse] = useState(false);
  const [responseGenerated, setResponseGenerated] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState({
    flagged: false,
    reviewed: false,
    metrics: false,
  });

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/chat');
      return;
    }
    loadData(true); // Pass true for initial load
    // Increase refresh interval to 30 seconds to reduce API calls
    const interval = setInterval(() => loadData(false), 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [user]);

  async function loadData(isInitial = false) {
    if (isInitial) {
      setInitialLoading(true);
      setDataLoading({ flagged: true, reviewed: true, metrics: true });
    }
    
    try {
      // Load flagged and reviewed messages first (faster, more critical)
      const flaggedPromise = getFlaggedMessages().then(res => {
        setFlaggedMessages(res.messages || []);
        setDataLoading(prev => ({ ...prev, flagged: false }));
        return res;
      }).catch(err => {
        setDataLoading(prev => ({ ...prev, flagged: false }));
        throw err;
      });

      const reviewedPromise = getReviewedMessages().then(res => {
        setReviewedMessages(res.messages || []);
        setDataLoading(prev => ({ ...prev, reviewed: false }));
        return res;
      }).catch(err => {
        setDataLoading(prev => ({ ...prev, reviewed: false }));
        throw err;
      });

      // Load metrics separately (slower, can load after UI is visible)
      const metricsPromise = getMetrics().then(res => {
        setMetrics(res);
        setDataLoading(prev => ({ ...prev, metrics: false }));
        setInitialLoading(false);
        return res;
      }).catch(err => {
        setDataLoading(prev => ({ ...prev, metrics: false }));
        setInitialLoading(false);
        throw err;
      });

      // Load improvement metrics in parallel
      getImprovementMetrics().then(res => {
        setImprovementMetrics(res);
      }).catch(err => {
        console.error('Error loading improvement metrics:', err);
      });

      // Wait for all, but UI will show progressively
      await Promise.all([flaggedPromise, reviewedPromise, metricsPromise]);
    } catch (error) {
      console.error('Error loading data:', error);
      setInitialLoading(false);
      setDataLoading({ flagged: false, reviewed: false, metrics: false });
      // Don't show toast for rate limit errors during auto-refresh
      if (!error.message.includes('429') && !error.message.includes('Too many requests')) {
        toast({
          title: 'Error',
          description: 'Failed to load dashboard data',
          variant: 'destructive',
        });
      }
    }
  }

  function openReviewDialog(message) {
    setSelectedMessage(message);
    setVerdict('safe');
    setFeedback('');
    setCorrectedResponse('');
    setResponseGenerated(false);
    setReviewDialogOpen(true);
  }

  async function handleGenerateResponse() {
    if (!selectedMessage || !feedback.trim()) {
      toast({
        title: 'Feedback Required',
        description: 'Please provide feedback before generating a corrected response.',
        variant: 'destructive',
      });
      return;
    }
    
    setGeneratingResponse(true);
    try {
      const result = await generateCorrectedResponse(selectedMessage.id, feedback);
      setCorrectedResponse(result.correctedResponse || '');
      setResponseGenerated(true);
      toast({
        title: 'Success',
        description: 'Corrected response generated. Please review and accept if satisfactory.',
      });
    } catch (error) {
      console.error('Error generating corrected response:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate corrected response',
        variant: 'destructive',
      });
    } finally {
      setGeneratingResponse(false);
    }
  }

  async function handleReview() {
    if (!selectedMessage) return;
    
    // If unsafe, require corrected response to be generated and accepted
    if (verdict === 'unsafe' && (!correctedResponse || !correctedResponse.trim())) {
      toast({
        title: 'Corrected Response Required',
        description: 'Please generate and accept a corrected response before submitting.',
        variant: 'destructive',
      });
      return;
    }
    
    setLoading(true);
    try {
      await reviewMessage(
        selectedMessage.id,
        verdict,
        feedback || null,
        verdict === 'unsafe' ? correctedResponse : null
      );
      
      toast({
        title: 'Success',
        description: 'Review submitted successfully',
      });
      setReviewDialogOpen(false);
      // Reset state
      setCorrectedResponse('');
      setResponseGenerated(false);
      // Add a small delay before reloading to avoid rate limit issues
      setTimeout(async () => {
        await loadData(false);
      }, 500);
    } catch (error) {
      console.error('Error reviewing message:', error);
      // Handle rate limit errors specifically
      if (error.message.includes('429') || error.message.includes('Too many requests')) {
        toast({
          title: 'Rate Limit',
          description: 'Too many requests. Please wait a moment and try again.',
          variant: 'destructive',
        });
        // Still reload data after a delay
        setTimeout(async () => {
          await loadData(false);
        }, 2000);
      } else {
        toast({
          title: 'Error',
          description: error.message || 'Failed to submit review',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  }

  const getRiskBadgeVariant = (riskLevel) => {
    switch (riskLevel) {
      case 'high': return 'danger';
      case 'medium': return 'warning';
      case 'low': return 'success';
      default: return 'secondary';
    }
  };

  // Floating elements for admin dashboard
  const floatingElements = [
    { icon: Heart, color: "text-rose-300", size: "w-8 h-8", delay: 0, duration: 8, x: "2%", y: "10%" },
    { icon: Flower2, color: "text-purple-300", size: "w-7 h-7", delay: 1, duration: 10, x: "96%", y: "20%" },
    { icon: Leaf, color: "text-green-300", size: "w-6 h-6", delay: 2, duration: 9, x: "4%", y: "70%" },
    { icon: Sparkles, color: "text-amber-300", size: "w-7 h-7", delay: 0.5, duration: 11, x: "94%", y: "60%" },
  ];

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-gold-50 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Floating gold particles */}
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={`particle-${i}`}
            className="absolute w-1 h-1 bg-gold-400/30 rounded-full"
            style={{ transform: 'translateZ(0)' }}
            initial={{
              x: typeof window !== 'undefined' ? Math.random() * window.innerWidth : Math.random() * 1920,
              y: typeof window !== 'undefined' ? Math.random() * window.innerHeight : Math.random() * 1080,
            }}
            animate={{
              y: [null, (Math.random() - 0.5) * 150],
              x: [null, (Math.random() - 0.5) * 150],
              opacity: [0.15, 0.4, 0.15],
            }}
            transition={{
              duration: Math.random() * 8 + 6,
              repeat: Infinity,
              delay: Math.random() * 3,
              ease: [0.4, 0, 0.6, 1],
            }}
          />
        ))}
        
        {/* Mental health themed floating elements */}
        {floatingElements.map((element, i) => {
          const Icon = element.icon;
          return (
            <motion.div
              key={`floating-${i}`}
              className={`absolute ${element.size} ${element.color} opacity-15 cursor-pointer group`}
              style={{
                left: element.x,
                top: element.y,
                transform: 'translateZ(0)',
              }}
              animate={{
                y: [null, -12, 12, -8, 8, 0],
                x: [null, -4, 4, -2, 2, 0],
                rotate: [0, 2, -2, 1, -1, 0],
                opacity: [0.1, 0.2, 0.15, 0.18, 0.12, 0.15],
              }}
              transition={{
                duration: element.duration * 1.5,
                repeat: Infinity,
                delay: element.delay,
                ease: [0.4, 0, 0.6, 1],
              }}
              whileHover={{
                scale: 1.3,
                opacity: 0.5,
                transition: { duration: 0.3 },
              }}
            >
              <Icon className="w-full h-full drop-shadow-lg group-hover:drop-shadow-[0_0_15px_currentColor] transition-all duration-300" />
            </motion.div>
          );
        })}
        
        {/* Large decorative gradient orbs */}
        <motion.div
          className="absolute -top-40 -right-40 w-96 h-96 bg-gold-200/10 rounded-full blur-3xl"
          style={{ transform: 'translateZ(0)' }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.15, 0.3, 0.15],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: [0.4, 0, 0.6, 1],
          }}
        />
        <motion.div
          className="absolute -bottom-40 -left-40 w-96 h-96 bg-amber-200/10 rounded-full blur-3xl"
          style={{ transform: 'translateZ(0)' }}
          animate={{
            scale: [1, 1.25, 1],
            opacity: [0.15, 0.3, 0.15],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: [0.4, 0, 0.6, 1],
            delay: 2,
          }}
        />
      </div>

      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Header with glass morphism */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              variant="ghost"
              onClick={() => navigate('/chat')}
              className="mb-6 bg-white/50 backdrop-blur-sm border border-gold-200/50 hover:bg-white/80 hover:shadow-md hover:shadow-gold-300/30 transition-all"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Chat
            </Button>
          </motion.div>
          <div className="flex items-center gap-4 bg-white/40 backdrop-blur-xl rounded-2xl p-6 border-2 border-gold-200/50 shadow-lg shadow-gold-200/20">
            <motion.div
              whileHover={{ rotate: [0, -10, 10, -10, 0] }}
              transition={{ duration: 0.5 }}
            >
              <div className="p-3 bg-gradient-to-br from-gold-500 to-gold-600 rounded-xl shadow-lg shadow-gold-500/30">
                <Shield className="h-8 w-8 text-white" />
              </div>
            </motion.div>
            <div className="flex-1">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-gold-600 via-gold-500 to-gold-700 bg-clip-text text-transparent mb-2">
                Admin Dashboard
              </h1>
              <p className="text-gray-700 font-medium">Review and manage flagged conversations</p>
            </div>
          </div>
        </motion.div>

        <Tabs defaultValue="flagged" className="space-y-6">
          <TabsList className="bg-white/40 backdrop-blur-xl border-2 border-gold-200/50 shadow-lg shadow-gold-200/20 p-1.5 rounded-xl">
            <TabsTrigger 
              value="flagged"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-gold-500 data-[state=active]:to-gold-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-gold-500/40 transition-all rounded-lg"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Flagged ({flaggedMessages.length})
            </TabsTrigger>
            <TabsTrigger 
              value="reviewed"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-gold-500 data-[state=active]:to-gold-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-gold-500/40 transition-all rounded-lg"
            >
              <Eye className="h-4 w-4 mr-2" />
              Reviewed ({reviewedMessages.length})
            </TabsTrigger>
            <TabsTrigger 
              value="metrics"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-gold-500 data-[state=active]:to-gold-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-gold-500/40 transition-all rounded-lg"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Metrics
            </TabsTrigger>
            <TabsTrigger 
              value="improvement"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-gold-500 data-[state=active]:to-gold-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-gold-500/40 transition-all rounded-lg"
            >
              <LineChart className="h-4 w-4 mr-2" />
              Improvement
            </TabsTrigger>
          </TabsList>

          <TabsContent value="flagged" className="space-y-4">
            {dataLoading.flagged ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="bg-white/60 backdrop-blur-xl border-2 border-gold-200/50 shadow-lg">
                    <CardContent className="py-8">
                      <div className="animate-pulse space-y-4">
                        <div className="h-6 bg-gold-200/50 rounded w-1/3"></div>
                        <div className="h-4 bg-gold-200/30 rounded w-2/3"></div>
                        <div className="h-20 bg-gold-200/30 rounded"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </motion.div>
            ) : flaggedMessages.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <Card className="bg-white/60 backdrop-blur-xl border-2 border-gold-200/50 shadow-lg shadow-gold-200/20">
                  <CardContent className="py-16 text-center">
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4 drop-shadow-lg" />
                    </motion.div>
                    <p className="text-lg font-semibold text-gray-700">No flagged messages at this time</p>
                    <p className="text-sm text-muted-foreground mt-2">All conversations are safe and clear</p>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              flaggedMessages.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <Card className="bg-white/70 backdrop-blur-xl border-2 border-gold-300/60 shadow-xl shadow-gold-300/20 hover:shadow-2xl hover:shadow-gold-400/30 hover:border-gold-400/80 transition-all duration-300 group">
                    <CardHeader className="border-b border-gold-200/50 bg-gradient-to-r from-white/50 to-gold-50/30">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-gradient-to-br from-amber-100 to-amber-50 rounded-lg border border-amber-200/50">
                              <AlertTriangle className="h-5 w-5 text-amber-600" />
                            </div>
                            <CardTitle className="text-xl font-bold text-gray-800">Flagged Message</CardTitle>
                            <Badge 
                              variant={getRiskBadgeVariant(item.risk_level)}
                              className="shadow-md text-xs font-bold px-3 py-1"
                            >
                              {item.risk_level?.toUpperCase() || 'UNKNOWN'}
                            </Badge>
                          </div>
                          <CardDescription className="text-sm font-medium text-gray-600">
                            <span className="font-semibold">User:</span> {item.conversations?.users?.email || 'Unknown'} •{' '}
                            <span className="font-semibold">Time:</span> {new Date(item.created_at).toLocaleString()}
                          </CardDescription>
                        </div>
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          <Button
                            variant="gold"
                            onClick={() => openReviewDialog(item)}
                            className="bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 shadow-lg shadow-gold-500/40 hover:shadow-xl hover:shadow-gold-500/50 transition-all"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Review
                          </Button>
                        </motion.div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-6">
                      <div>
                        <Label className="text-sm font-bold mb-3 block text-gray-700 flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" />
                          User Message:
                        </Label>
                        <Card className="p-4 bg-gradient-to-br from-blue-50/80 to-blue-100/50 backdrop-blur-sm border-2 border-blue-200/50 shadow-md">
                          <p className="text-sm text-gray-800 leading-relaxed">
                            {(() => {
                              const conversation = item.conversations;
                              const messages = conversation?.messages || [];
                              // Sort all messages by created_at to get chronological order
                              const sortedMessages = [...messages].sort((a, b) => 
                                new Date(a.created_at) - new Date(b.created_at)
                              );
                              // Find the index of the flagged AI message
                              const flaggedMessageIndex = sortedMessages.findIndex(msg => msg.id === item.id);
                              // Find the user message that comes right before this AI message
                              const userMessage = sortedMessages
                                .slice(0, flaggedMessageIndex)
                                .reverse()
                                .find(m => m.sender === 'user');
                              return userMessage?.content || 'N/A';
                            })()}
                          </p>
                        </Card>
                      </div>
                      <div>
                        <Label className="text-sm font-bold mb-3 block text-gray-700 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          AI Response:
                        </Label>
                        <Card className="p-4 bg-gradient-to-br from-amber-50/80 to-amber-100/50 backdrop-blur-sm border-2 border-amber-300/60 shadow-md shadow-amber-300/20">
                          <p className="text-sm text-gray-800 leading-relaxed">{item.content}</p>
                        </Card>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            )}
          </TabsContent>

          <TabsContent value="reviewed" className="space-y-4">
            {dataLoading.reviewed ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="bg-white/60 backdrop-blur-xl border-2 border-gold-200/50 shadow-lg">
                    <CardContent className="py-8">
                      <div className="animate-pulse space-y-4">
                        <div className="h-6 bg-gold-200/50 rounded w-1/3"></div>
                        <div className="h-4 bg-gold-200/30 rounded w-2/3"></div>
                        <div className="h-20 bg-gold-200/30 rounded"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </motion.div>
            ) : reviewedMessages.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <Card className="bg-white/60 backdrop-blur-xl border-2 border-gold-200/50 shadow-lg shadow-gold-200/20">
                  <CardContent className="py-16 text-center">
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <Eye className="h-16 w-16 text-blue-500 mx-auto mb-4 drop-shadow-lg" />
                    </motion.div>
                    <p className="text-lg font-semibold text-gray-700">No reviewed messages yet</p>
                    <p className="text-sm text-muted-foreground mt-2">Reviewed messages will appear here</p>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              reviewedMessages.map((item, index) => {
                const review = item.reviews?.[0];
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                  >
                    <Card className="bg-white/70 backdrop-blur-xl border-2 border-gold-300/60 shadow-xl shadow-gold-300/20 hover:shadow-2xl hover:shadow-gold-400/30 hover:border-gold-400/80 transition-all duration-300">
                      <CardHeader className="border-b border-gold-200/50 bg-gradient-to-r from-white/50 to-gold-50/30">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <div className={`p-2 rounded-lg border ${
                                review?.verdict === 'unsafe' 
                                  ? 'bg-gradient-to-br from-red-100 to-red-50 border-red-200/50' 
                                  : 'bg-gradient-to-br from-green-100 to-green-50 border-green-200/50'
                              }`}>
                                {review?.verdict === 'unsafe' ? (
                                  <AlertTriangle className="h-5 w-5 text-red-600" />
                                ) : (
                                  <CheckCircle className="h-5 w-5 text-green-600" />
                                )}
                              </div>
                              <CardTitle className="text-xl font-bold text-gray-800">Reviewed Message</CardTitle>
                              <Badge 
                                variant={review?.verdict === 'unsafe' ? 'danger' : 'success'}
                                className="shadow-md text-xs font-bold px-3 py-1"
                              >
                                {review?.verdict === 'unsafe' ? 'UNSAFE' : 'SAFE'}
                              </Badge>
                              {item.risk_level && (
                                <Badge 
                                  variant={getRiskBadgeVariant(item.risk_level)}
                                  className="shadow-md text-xs font-bold px-3 py-1"
                                >
                                  {item.risk_level.toUpperCase()}
                                </Badge>
                              )}
                            </div>
                            <CardDescription className="text-sm font-medium text-gray-600">
                              <span className="font-semibold">User:</span> {item.conversations?.users?.email || 'Unknown'} •{' '}
                              <span className="font-semibold">Reviewed by:</span> {review?.users?.email || 'Unknown'} •{' '}
                              <span className="font-semibold">Time:</span> {new Date(item.created_at).toLocaleString()}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-6">
                        <div>
                          <Label className="text-sm font-bold mb-3 block text-gray-700 flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            User Message:
                          </Label>
                          <Card className="p-4 bg-gradient-to-br from-blue-50/80 to-blue-100/50 backdrop-blur-sm border-2 border-blue-200/50 shadow-md">
                            <p className="text-sm text-gray-800 leading-relaxed">
                              {(() => {
                                const conversation = item.conversations;
                                const messages = conversation?.messages || [];
                                // Sort all messages by created_at to get chronological order
                                const sortedMessages = [...messages].sort((a, b) => 
                                  new Date(a.created_at) - new Date(b.created_at)
                                );
                                // Find the index of the reviewed AI message
                                const reviewedMessageIndex = sortedMessages.findIndex(msg => msg.id === item.id);
                                // Find the user message that comes right before this AI message
                                const userMessage = sortedMessages
                                  .slice(0, reviewedMessageIndex)
                                  .reverse()
                                  .find(m => m.sender === 'user');
                                return userMessage?.content || 'N/A';
                              })()}
                            </p>
                          </Card>
                        </div>
                        <div>
                          <Label className="text-sm font-bold mb-3 block text-gray-700 flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            AI Response (Final):
                          </Label>
                          <Card className="p-4 bg-gradient-to-br from-green-50/80 to-green-100/50 backdrop-blur-sm border-2 border-green-300/60 shadow-md shadow-green-300/20">
                            <p className="text-sm text-gray-800 leading-relaxed">{item.content}</p>
                          </Card>
                        </div>
                        {review?.feedback && (
                          <div>
                            <Label className="text-sm font-bold mb-3 block text-gray-700 flex items-center gap-2">
                              <Shield className="h-4 w-4 text-blue-600" />
                              Admin Feedback:
                            </Label>
                            <Card className="p-4 bg-gradient-to-br from-blue-50/80 to-blue-100/50 backdrop-blur-sm border-2 border-blue-300/60 shadow-md shadow-blue-300/20">
                              <p className="text-sm text-gray-800 leading-relaxed">{review.feedback}</p>
                            </Card>
                          </div>
                        )}
                        {review?.verdict === 'unsafe' && (
                          <>
                            {review.original_response && (
                              <div>
                                <Label className="text-sm font-bold mb-3 block text-gray-700 flex items-center gap-2">
                                  <AlertTriangle className="h-4 w-4 text-red-600" />
                                  Original Unsafe Response:
                                </Label>
                                <Card className="p-4 bg-gradient-to-br from-red-50/80 to-red-100/50 backdrop-blur-sm border-2 border-red-300/60 shadow-md">
                                  <p className="text-sm line-through text-gray-500 leading-relaxed">
                                    {review.original_response}
                                  </p>
                                </Card>
                              </div>
                            )}
                            {review.corrected_response && (
                              <div>
                                <Label className="text-sm font-bold mb-3 block text-gray-700 flex items-center gap-2">
                                  <Sparkles className="h-4 w-4 text-green-600" />
                                  Corrected Response:
                                </Label>
                                <Card className="p-4 bg-gradient-to-br from-green-50/80 to-green-100/50 backdrop-blur-sm border-2 border-green-300/60 shadow-md shadow-green-300/20">
                                  <p className="text-sm text-gray-800 leading-relaxed">{review.corrected_response}</p>
                                </Card>
                              </div>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="metrics">
            {dataLoading.metrics ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Card key={i} className="bg-white/60 backdrop-blur-xl border-2 border-gold-200/50 shadow-lg">
                      <CardContent className="py-6">
                        <div className="animate-pulse space-y-3">
                          <div className="h-4 bg-gold-200/50 rounded w-1/2"></div>
                          <div className="h-8 bg-gold-200/30 rounded w-3/4"></div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Card className="bg-white/60 backdrop-blur-xl border-2 border-gold-200/50 shadow-lg">
                  <CardContent className="py-12">
                    <div className="animate-pulse space-y-4">
                      <div className="h-6 bg-gold-200/50 rounded w-1/4"></div>
                      <div className="h-32 bg-gold-200/30 rounded"></div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : metrics ? (
              <div className="space-y-6">
                {/* Learning Progress Section */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="grid md:grid-cols-2 gap-6"
                >
                  {/* Day-to-Day Improvement Card */}
                  <Card className="bg-gradient-to-br from-green-50/80 to-emerald-50/60 backdrop-blur-xl border-2 border-green-300/60 shadow-xl shadow-green-300/20 hover:shadow-2xl hover:shadow-green-400/30 transition-all duration-300">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <CardDescription className="text-sm font-semibold text-gray-600">Day-to-Day Improvement</CardDescription>
                            <TooltipProvider>
                              <Tooltip delayDuration={300}>
                                <TooltipTrigger asChild>
                                  <Info className="h-4 w-4 text-gray-400 hover:text-gold-600 cursor-help transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-sm">
                                  <p className="font-semibold mb-1 text-gold-700">Day-to-Day Improvement</p>
                                  <p className="text-xs leading-relaxed">
                                    Calculated as the percentage change in flagged message rate from yesterday to today. 
                                    A positive value indicates improvement (fewer flagged messages), showing the chatbot is learning from admin feedback.
                                    Formula: ((Yesterday's Flagged Rate - Today's Flagged Rate) / Yesterday's Flagged Rate) × 100
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <CardTitle className="text-5xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                            {metrics.dayToDayImprovement > 0 ? `+${metrics.dayToDayImprovement.toFixed(1)}` : metrics.dayToDayImprovement.toFixed(1)}%
                          </CardTitle>
                          <p className="text-xs text-gray-600 mt-2">
                            Improvement from yesterday to today
                          </p>
                        </div>
                        <motion.div
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          <div className="p-4 bg-gradient-to-br from-green-100 to-emerald-100 rounded-xl border border-green-200/50">
                            {metrics.dayToDayImprovement > 0 ? (
                              <TrendingDown className="h-10 w-10 text-green-600" />
                            ) : (
                              <TrendingUp className="h-10 w-10 text-amber-600" />
                            )}
                          </div>
                        </motion.div>
                      </div>
                    </CardHeader>
                  </Card>

                  {/* Feedback Count Card */}
                  <Card className="bg-gradient-to-br from-purple-50/80 to-indigo-50/60 backdrop-blur-xl border-2 border-purple-300/60 shadow-xl shadow-purple-300/20 hover:shadow-2xl hover:shadow-purple-400/30 transition-all duration-300">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <CardDescription className="text-sm font-semibold text-gray-600">Total Feedback Provided</CardDescription>
                            <TooltipProvider>
                              <Tooltip delayDuration={300}>
                                <TooltipTrigger asChild>
                                  <Info className="h-4 w-4 text-gray-400 hover:text-gold-600 cursor-help transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-sm">
                                  <p className="font-semibold mb-1 text-gold-700">Total Feedback Provided</p>
                                  <p className="text-xs leading-relaxed">
                                    The total number of feedback entries stored in the feedback memory database. 
                                    Each entry contains the original unsafe response, admin feedback, and the corrected response. 
                                    The chatbot uses this feedback to learn and improve its responses over time.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <CardTitle className="text-5xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                            {metrics.totalFeedback || 0}
                          </CardTitle>
                          <p className="text-xs text-gray-600 mt-2">
                            Learning examples the chatbot has learned from
                          </p>
                        </div>
                        <div className="p-4 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-xl border border-purple-200/50">
                          <Brain className="h-10 w-10 text-purple-600" />
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                </motion.div>

                {/* Day-to-Day Comparison Section */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="grid md:grid-cols-3 gap-6"
                >
                  {/* Today */}
                  <Card className="bg-white/70 backdrop-blur-xl border-2 border-green-300/60 shadow-xl shadow-green-300/20">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg font-bold text-gray-800">
                        <div className="p-2 bg-gradient-to-br from-green-100 to-green-50 rounded-lg border border-green-200/50">
                          <Sparkles className="h-5 w-5 text-green-600" />
                        </div>
                        Today
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <TooltipProvider>
                        <div className="space-y-3">
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <div className="flex justify-between items-center p-3 bg-gradient-to-r from-blue-50/50 to-blue-100/30 rounded-lg border border-blue-200/50 cursor-help hover:bg-blue-100/40 transition-colors">
                                <span className="text-sm font-semibold text-gray-700">Messages</span>
                                <span className="text-lg font-bold text-blue-600">{metrics.todayMessagesCount || 0}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-semibold mb-1 text-gold-700">Today's Messages</p>
                              <p className="text-xs leading-relaxed">
                                Total number of messages sent today (from midnight to now). Includes both user and AI messages.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <div className="flex justify-between items-center p-3 bg-gradient-to-r from-amber-50/50 to-amber-100/30 rounded-lg border border-amber-200/50 cursor-help hover:bg-amber-100/40 transition-colors">
                                <span className="text-sm font-semibold text-gray-700">Flagged</span>
                                <span className="text-lg font-bold text-amber-600">{metrics.todayFlaggedCount || 0}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-semibold mb-1 text-gold-700">Today's Flagged Messages</p>
                              <p className="text-xs leading-relaxed">
                                Total number of messages flagged today, including both currently flagged and reviewed messages. 
                                This preserves historical data even after messages are reviewed.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <div className="flex justify-between items-center p-3 bg-gradient-to-r from-red-50/50 to-red-100/30 rounded-lg border border-red-200/50 cursor-help hover:bg-red-100/40 transition-colors">
                                <span className="text-sm font-semibold text-gray-700">Flagged Rate</span>
                                <span className="text-lg font-bold text-red-600">{metrics.todayFlaggedRate?.toFixed(1) || 0}%</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-semibold mb-1 text-gold-700">Today's Flagged Rate</p>
                              <p className="text-xs leading-relaxed">
                                Percentage of messages flagged today. Calculated as: (Flagged Messages / Total Messages) × 100. 
                                Lower rates indicate better performance and learning from feedback.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TooltipProvider>
                    </CardContent>
                  </Card>

                  {/* Yesterday */}
                  <Card className="bg-white/70 backdrop-blur-xl border-2 border-blue-300/60 shadow-xl shadow-blue-300/20">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg font-bold text-gray-800">
                        <div className="p-2 bg-gradient-to-br from-blue-100 to-blue-50 rounded-lg border border-blue-200/50">
                          <ArrowDown className="h-5 w-5 text-blue-600" />
                        </div>
                        Yesterday
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <TooltipProvider>
                        <div className="space-y-3">
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <div className="flex justify-between items-center p-3 bg-gradient-to-r from-blue-50/50 to-blue-100/30 rounded-lg border border-blue-200/50 cursor-help hover:bg-blue-100/40 transition-colors">
                                <span className="text-sm font-semibold text-gray-700">Messages</span>
                                <span className="text-lg font-bold text-blue-600">{metrics.yesterdayMessagesCount || 0}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-semibold mb-1 text-gold-700">Yesterday's Messages</p>
                              <p className="text-xs leading-relaxed">
                                Total number of messages sent yesterday (from midnight to 11:59 PM). Used for day-to-day comparison.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <div className="flex justify-between items-center p-3 bg-gradient-to-r from-amber-50/50 to-amber-100/30 rounded-lg border border-amber-200/50 cursor-help hover:bg-amber-100/40 transition-colors">
                                <span className="text-sm font-semibold text-gray-700">Flagged</span>
                                <span className="text-lg font-bold text-amber-600">{metrics.yesterdayFlaggedCount || 0}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-semibold mb-1 text-gold-700">Yesterday's Flagged Messages</p>
                              <p className="text-xs leading-relaxed">
                                Total number of messages flagged yesterday, including reviewed messages. 
                                This historical data is preserved for trend analysis.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <div className="flex justify-between items-center p-3 bg-gradient-to-r from-red-50/50 to-red-100/30 rounded-lg border border-red-200/50 cursor-help hover:bg-red-100/40 transition-colors">
                                <span className="text-sm font-semibold text-gray-700">Flagged Rate</span>
                                <span className="text-lg font-bold text-red-600">{metrics.yesterdayFlaggedRate?.toFixed(1) || 0}%</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-semibold mb-1 text-gold-700">Yesterday's Flagged Rate</p>
                              <p className="text-xs leading-relaxed">
                                Percentage of messages flagged yesterday. Calculated as: (Flagged Messages / Total Messages) × 100. 
                                Compared with today's rate to show improvement.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TooltipProvider>
                    </CardContent>
                  </Card>

                  {/* 2 Days Ago */}
                  <Card className="bg-white/70 backdrop-blur-xl border-2 border-orange-300/60 shadow-xl shadow-orange-300/20">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg font-bold text-gray-800">
                        <div className="p-2 bg-gradient-to-br from-orange-100 to-orange-50 rounded-lg border border-orange-200/50">
                          <ArrowUp className="h-5 w-5 text-orange-600" />
                        </div>
                        2 Days Ago
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <TooltipProvider>
                        <div className="space-y-3">
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <div className="flex justify-between items-center p-3 bg-gradient-to-r from-blue-50/50 to-blue-100/30 rounded-lg border border-blue-200/50 cursor-help hover:bg-blue-100/40 transition-colors">
                                <span className="text-sm font-semibold text-gray-700">Messages</span>
                                <span className="text-lg font-bold text-blue-600">{metrics.twoDaysAgoMessagesCount || 0}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-semibold mb-1 text-gold-700">2 Days Ago Messages</p>
                              <p className="text-xs leading-relaxed">
                                Total number of messages sent two days ago. Used for extended trend analysis and comparison.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <div className="flex justify-between items-center p-3 bg-gradient-to-r from-amber-50/50 to-amber-100/30 rounded-lg border border-amber-200/50 cursor-help hover:bg-amber-100/40 transition-colors">
                                <span className="text-sm font-semibold text-gray-700">Flagged</span>
                                <span className="text-lg font-bold text-amber-600">{metrics.twoDaysAgoFlaggedCount || 0}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-semibold mb-1 text-gold-700">2 Days Ago Flagged Messages</p>
                              <p className="text-xs leading-relaxed">
                                Total number of messages flagged two days ago, including reviewed messages. 
                                Preserved for historical trend tracking.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <div className="flex justify-between items-center p-3 bg-gradient-to-r from-red-50/50 to-red-100/30 rounded-lg border border-red-200/50 cursor-help hover:bg-red-100/40 transition-colors">
                                <span className="text-sm font-semibold text-gray-700">Flagged Rate</span>
                                <span className="text-lg font-bold text-red-600">{metrics.twoDaysAgoFlaggedRate?.toFixed(1) || 0}%</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-semibold mb-1 text-gold-700">2 Days Ago Flagged Rate</p>
                              <p className="text-xs leading-relaxed">
                                Percentage of messages flagged two days ago. Calculated as: (Flagged Messages / Total Messages) × 100. 
                                Part of the trend analysis showing learning progress.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TooltipProvider>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Hourly Trend Chart */}
                {metrics.hourlyData && metrics.hourlyData.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.15 }}
                  >
                    <Card className="bg-white/70 backdrop-blur-xl border-2 border-purple-300/60 shadow-xl shadow-purple-300/20">
                      <CardHeader>
                        <div className="flex items-center gap-2 mb-2">
                          <CardTitle className="flex items-center gap-3 text-xl font-bold text-gray-800">
                            <div className="p-2 bg-gradient-to-br from-purple-100 to-purple-50 rounded-lg border border-purple-200/50">
                              <BarChart3 className="h-6 w-6 text-purple-600" />
                            </div>
                            Hourly Trend (Last 24 Hours)
                          </CardTitle>
                          <TooltipProvider>
                            <Tooltip delayDuration={300}>
                              <TooltipTrigger asChild>
                                <Info className="h-4 w-4 text-gray-400 hover:text-gold-600 cursor-help transition-colors" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-sm">
                                <p className="font-semibold mb-1 text-gold-700">Hourly Trend (Last 24 Hours)</p>
                                <p className="text-xs leading-relaxed">
                                  Shows the number of flagged messages per hour over the last 24 hours. 
                                  Each bar represents one hour, with recent hours (last 6) highlighted in green to show recent improvements. 
                                  This helps identify patterns and track real-time learning progress.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <CardDescription className="text-sm text-gray-600">
                          Real-time improvement tracking showing flagged messages by hour
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="h-64 flex items-end justify-between gap-1">
                          {metrics.hourlyData.map((hour, index) => {
                            const maxFlagged = Math.max(...metrics.hourlyData.map(h => h.flagged), 1);
                            // Ultra-aggressive scaling for small datasets - make every small difference visible
                            // For very small values (0-5), use extreme zoom to show differences clearly
                            let scaleFactor = 1;
                            let minHeight = 0;
                            if (maxFlagged <= 2) {
                              // Extreme zoom: each unit = 40% of chart height
                              scaleFactor = 40;
                              minHeight = hour.flagged > 0 ? 80 : 0; // 80% minimum for any non-zero
                            } else if (maxFlagged <= 5) {
                              // Strong zoom: each unit = 20% of chart height
                              scaleFactor = 20;
                              minHeight = hour.flagged > 0 ? 70 : 0; // 70% minimum for any non-zero
                            } else if (maxFlagged <= 10) {
                              // Moderate zoom: each unit = 10% of chart height
                              scaleFactor = 10;
                              minHeight = hour.flagged > 0 ? 60 : 0; // 60% minimum for any non-zero
                            } else {
                              // Normal scaling for larger datasets
                              scaleFactor = 100 / maxFlagged;
                              minHeight = hour.flagged > 0 ? 30 : 0;
                            }
                            const baseHeight = hour.flagged * scaleFactor;
                            const height = Math.max(baseHeight, minHeight);
                            const isRecent = index >= metrics.hourlyData.length - 6; // Last 6 hours
                            
                            return (
                              <div key={`${hour.date}-${hour.hour}`} className="flex-1 flex flex-col items-center gap-1 group relative">
                                <motion.div
                                  initial={{ height: 0 }}
                                  animate={{ height: `${height}%` }}
                                  transition={{ duration: 0.5, delay: index * 0.03 }}
                                  className={`w-full rounded-t transition-all ${
                                    isRecent 
                                      ? 'bg-gradient-to-t from-green-500 to-green-400' 
                                      : 'bg-gradient-to-t from-purple-500 to-purple-400'
                                  } opacity-80 hover:opacity-100 group-hover:shadow-lg`}
                                  style={{ minHeight: hour.flagged > 0 ? '4px' : '0' }}
                                />
                                {index % 4 === 0 && (
                                  <span className="text-xs text-gray-500 transform -rotate-45 origin-top-left whitespace-nowrap">
                                    {hour.hourLabel}
                                  </span>
                                )}
                                <div className="hidden group-hover:block absolute -top-10 bg-gray-900 text-white text-xs px-2 py-1 rounded z-10 whitespace-nowrap">
                                  {hour.flagged} flagged<br/>
                                  {hour.total} total
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-purple-200/50">
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-purple-500 rounded"></div>
                            <span className="text-xs text-gray-600">Earlier Hours</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-green-500 rounded"></div>
                            <span className="text-xs text-gray-600">Recent (Last 6 Hours)</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {/* Trend Chart */}
                {metrics.dailyData && metrics.dailyData.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                  >
                    <Card className="bg-white/70 backdrop-blur-xl border-2 border-gold-300/60 shadow-xl shadow-gold-300/20">
                      <CardHeader>
                        <div className="flex items-center gap-2 mb-2">
                          <CardTitle className="flex items-center gap-3 text-xl font-bold text-gray-800">
                            <div className="p-2 bg-gradient-to-br from-gold-100 to-gold-50 rounded-lg border border-gold-200/50">
                              <BarChart3 className="h-6 w-6 text-gold-600" />
                            </div>
                            Flagged Messages Trend (Last 30 Days)
                          </CardTitle>
                          <TooltipProvider>
                            <Tooltip delayDuration={300}>
                              <TooltipTrigger asChild>
                                <Info className="h-4 w-4 text-gray-400 hover:text-gold-600 cursor-help transition-colors" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-sm">
                                <p className="font-semibold mb-1 text-gold-700">Flagged Messages Trend (Last 30 Days)</p>
                                <p className="text-xs leading-relaxed">
                                  Shows the daily count of flagged messages over the last 30 days. 
                                  Recent days (last 3) are highlighted in green to emphasize recent improvements. 
                                  A downward trend indicates the chatbot is learning from admin feedback and improving over time.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <CardDescription className="text-sm text-gray-600">
                          Day-to-day trend showing the decrease in flagged messages as the chatbot learns from feedback
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="h-64 flex items-end justify-between gap-1">
                          {metrics.dailyData.map((day, index) => {
                            const maxFlagged = Math.max(...metrics.dailyData.map(d => d.flagged), 1);
                            // Ultra-aggressive scaling for small datasets - make every small difference visible
                            // For very small values (0-5), use extreme zoom to show differences clearly
                            let scaleFactor = 1;
                            let minHeight = 0;
                            if (maxFlagged <= 2) {
                              // Extreme zoom: each unit = 40% of chart height
                              scaleFactor = 40;
                              minHeight = day.flagged > 0 ? 80 : 0; // 80% minimum for any non-zero
                            } else if (maxFlagged <= 5) {
                              // Strong zoom: each unit = 20% of chart height
                              scaleFactor = 20;
                              minHeight = day.flagged > 0 ? 70 : 0; // 70% minimum for any non-zero
                            } else if (maxFlagged <= 10) {
                              // Moderate zoom: each unit = 10% of chart height
                              scaleFactor = 10;
                              minHeight = day.flagged > 0 ? 60 : 0; // 60% minimum for any non-zero
                            } else {
                              // Normal scaling for larger datasets
                              scaleFactor = 100 / maxFlagged;
                              minHeight = day.flagged > 0 ? 30 : 0;
                            }
                            const baseHeight = day.flagged * scaleFactor;
                            const height = Math.max(baseHeight, minHeight);
                            const isRecent = index >= metrics.dailyData.length - 7;
                            
                            return (
                              <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group">
                                <motion.div
                                  initial={{ height: 0 }}
                                  animate={{ height: `${height}%` }}
                                  transition={{ duration: 0.5, delay: index * 0.02 }}
                                  className={`w-full rounded-t transition-all ${
                                    isRecent 
                                      ? 'bg-gradient-to-t from-green-500 to-green-400' 
                                      : 'bg-gradient-to-t from-amber-500 to-amber-400'
                                  } opacity-80 hover:opacity-100 group-hover:shadow-lg`}
                                  style={{ minHeight: day.flagged > 0 ? '4px' : '0' }}
                                />
                                {index % 5 === 0 && (
                                  <span className="text-xs text-gray-500 transform -rotate-45 origin-top-left whitespace-nowrap">
                                    {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </span>
                                )}
                                <div className="hidden group-hover:block absolute -top-8 bg-gray-900 text-white text-xs px-2 py-1 rounded z-10">
                                  {day.flagged} flagged
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-gold-200/50">
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-amber-500 rounded"></div>
                            <span className="text-xs text-gray-600">Earlier Days</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-green-500 rounded"></div>
                            <span className="text-xs text-gray-600">Recent (Last 3 Days)</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {/* Summary Stats */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 }}
                  className="grid md:grid-cols-2 lg:grid-cols-4 gap-6"
                >
                  <TooltipProvider>
                    <Card className="bg-white/70 backdrop-blur-xl border-2 border-blue-300/60 shadow-xl shadow-blue-300/20 hover:shadow-2xl hover:shadow-blue-400/30 transition-all duration-300">
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-gradient-to-br from-blue-100 to-blue-50 rounded-lg border border-blue-200/50">
                            <MessageSquare className="h-5 w-5 text-blue-600" />
                          </div>
                          <div className="flex items-center gap-2 flex-1">
                            <CardDescription className="text-sm font-semibold text-gray-600">Total Messages</CardDescription>
                            <Tooltip delayDuration={300}>
                              <TooltipTrigger asChild>
                                <Info className="h-3.5 w-3.5 text-gray-400 hover:text-gold-600 cursor-help transition-colors" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="font-semibold mb-1 text-gold-700">Total Messages</p>
                                <p className="text-xs leading-relaxed">
                                  The total count of all messages (both user and AI) across all conversations in the system since the beginning.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                        <CardTitle className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent">
                          {metrics.totalMessages || 0}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card className="bg-white/70 backdrop-blur-xl border-2 border-amber-300/60 shadow-xl shadow-amber-300/20 hover:shadow-2xl hover:shadow-amber-400/30 transition-all duration-300">
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-gradient-to-br from-amber-100 to-amber-50 rounded-lg border border-amber-200/50">
                            <AlertTriangle className="h-5 w-5 text-amber-600" />
                          </div>
                          <div className="flex items-center gap-2 flex-1">
                            <CardDescription className="text-sm font-semibold text-gray-600">Total Flagged</CardDescription>
                            <Tooltip delayDuration={300}>
                              <TooltipTrigger asChild>
                                <Info className="h-3.5 w-3.5 text-gray-400 hover:text-gold-600 cursor-help transition-colors" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="font-semibold mb-1 text-gold-700">Total Flagged</p>
                                <p className="text-xs leading-relaxed">
                                  Total number of messages that have been flagged for safety concerns, including both currently flagged and reviewed messages. 
                                  This preserves historical data to show the complete picture of safety monitoring.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                        <CardTitle className="text-4xl font-bold bg-gradient-to-r from-amber-600 to-amber-500 bg-clip-text text-transparent">
                          {metrics.flaggedCount || 0}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card className="bg-white/70 backdrop-blur-xl border-2 border-orange-300/60 shadow-xl shadow-orange-300/20 hover:shadow-2xl hover:shadow-orange-400/30 transition-all duration-300">
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-gradient-to-br from-orange-100 to-orange-50 rounded-lg border border-orange-200/50">
                            <BookOpen className="h-5 w-5 text-orange-600" />
                          </div>
                          <div className="flex items-center gap-2 flex-1">
                            <CardDescription className="text-sm font-semibold text-gray-600">Total Reviews</CardDescription>
                            <Tooltip delayDuration={300}>
                              <TooltipTrigger asChild>
                                <Info className="h-3.5 w-3.5 text-gray-400 hover:text-gold-600 cursor-help transition-colors" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="font-semibold mb-1 text-gold-700">Total Reviews</p>
                                <p className="text-xs leading-relaxed">
                                  Total number of flagged messages that have been reviewed by admins. 
                                  Each review includes admin feedback and, if unsafe, a corrected response that the chatbot learns from.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                        <CardTitle className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent">
                          {metrics.totalReviews || 0}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card className="bg-white/70 backdrop-blur-xl border-2 border-red-300/60 shadow-xl shadow-red-300/20 hover:shadow-2xl hover:shadow-red-400/30 transition-all duration-300">
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-gradient-to-br from-red-100 to-red-50 rounded-lg border border-red-200/50">
                            <Shield className="h-5 w-5 text-red-600" />
                          </div>
                          <div className="flex items-center gap-2 flex-1">
                            <CardDescription className="text-sm font-semibold text-gray-600">Correction Rate</CardDescription>
                            <Tooltip delayDuration={300}>
                              <TooltipTrigger asChild>
                                <Info className="h-3.5 w-3.5 text-gray-400 hover:text-gold-600 cursor-help transition-colors" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="font-semibold mb-1 text-gold-700">Correction Rate</p>
                                <p className="text-xs leading-relaxed">
                                  Percentage of reviewed messages that were marked as "unsafe" and required correction. 
                                  Calculated as: (Unsafe Reviews / Total Reviews) × 100. 
                                  Higher rates indicate more issues were found, but also more learning opportunities.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                        <CardTitle className="text-4xl font-bold bg-gradient-to-r from-red-600 to-red-500 bg-clip-text text-transparent">
                          {metrics.correctionRate?.toFixed(1) || 0}%
                        </CardTitle>
                      </CardHeader>
                    </Card>
                  </TooltipProvider>
                </motion.div>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <Card className="bg-white/60 backdrop-blur-xl border-2 border-gold-200/50 shadow-lg shadow-gold-200/20">
                  <CardContent className="py-16 text-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="rounded-full h-12 w-12 border-4 border-gold-600 border-t-transparent mx-auto mb-4"
                    />
                    <p className="text-muted-foreground font-medium">Loading metrics...</p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="improvement" className="space-y-6">
            {improvementMetrics ? (
              <TooltipProvider>
              <div className="space-y-6">
                {/* Overall Improvement Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="bg-gradient-to-br from-green-50/80 to-emerald-50/60 backdrop-blur-xl border-2 border-green-300/60 shadow-xl shadow-green-300/20 hover:shadow-2xl hover:shadow-green-400/30 transition-all duration-300">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                              <TrendingUpIcon className="h-6 w-6 text-green-600" />
                              Overall Improvement
                            </CardTitle>
                            <Tooltip delayDuration={300}>
                              <TooltipTrigger asChild>
                                <Info className="h-4 w-4 text-gray-400 hover:text-gold-600 cursor-help transition-colors" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="font-semibold mb-1 text-gold-700">Overall Improvement</p>
                                <p className="text-xs leading-relaxed">
                                  Percentage reduction in flagged message rate comparing recent batches to older batches. 
                                  Calculated as: ((Older Avg Flagged Rate - Recent Avg Flagged Rate) / Older Avg Flagged Rate) × 100. 
                                  Positive values indicate the AI is learning and improving from human feedback.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <CardDescription className="text-sm text-gray-600 mt-2">
                            AI learning progress based on human feedback
                          </CardDescription>
                        </div>
                        <div className="text-right">
                          <div className={`text-4xl font-bold bg-clip-text text-transparent ${
                            improvementMetrics.overallImprovement > 0 
                              ? 'bg-gradient-to-r from-green-600 to-emerald-600' 
                              : improvementMetrics.overallImprovement < 0
                              ? 'bg-gradient-to-r from-red-600 to-orange-600'
                              : 'bg-gradient-to-r from-gray-600 to-gray-400'
                          }`}>
                            {improvementMetrics.overallImprovement > 0 ? '+' : ''}
                            {improvementMetrics.overallImprovement?.toFixed(1) || 0}%
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {improvementMetrics.overallImprovement > 0 ? 'Reduction' : improvementMetrics.overallImprovement < 0 ? 'Increase' : 'No change'} in flagged rate
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid md:grid-cols-3 gap-4">
                        <TooltipProvider>
                          <div className="p-4 bg-white/60 backdrop-blur-sm rounded-lg border border-green-200/50">
                            <div className="flex items-center gap-1 mb-1">
                              <p className="text-xs text-gray-600">Recent Avg Flagged Rate</p>
                              <Tooltip delayDuration={300}>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 text-gray-400 hover:text-gold-600 cursor-help transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  <p className="font-semibold mb-1 text-gold-700">Recent Avg Flagged Rate</p>
                                  <p className="text-xs leading-relaxed">
                                    Average flagged message rate across the last 10 batches of messages. 
                                    Lower rates indicate better performance and learning from feedback.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <p className="text-2xl font-bold text-green-600">
                              {improvementMetrics.recentAvgFlaggedRate?.toFixed(1) || 0}%
                            </p>
                          </div>
                          <div className="p-4 bg-white/60 backdrop-blur-sm rounded-lg border border-green-200/50">
                            <div className="flex items-center gap-1 mb-1">
                              <p className="text-xs text-gray-600">Older Avg Flagged Rate</p>
                              <Tooltip delayDuration={300}>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 text-gray-400 hover:text-gold-600 cursor-help transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  <p className="font-semibold mb-1 text-gold-700">Older Avg Flagged Rate</p>
                                  <p className="text-xs leading-relaxed">
                                    Average flagged message rate across batches before the last 10 batches. 
                                    Used as a baseline to compare against recent performance and calculate improvement.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <p className="text-2xl font-bold text-amber-600">
                              {improvementMetrics.olderAvgFlaggedRate?.toFixed(1) || 0}%
                            </p>
                          </div>
                          <div className="p-4 bg-white/60 backdrop-blur-sm rounded-lg border border-green-200/50">
                            <div className="flex items-center gap-1 mb-1">
                              <p className="text-xs text-gray-600">Feedback Effectiveness</p>
                              <Tooltip delayDuration={300}>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 text-gray-400 hover:text-gold-600 cursor-help transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  <p className="font-semibold mb-1 text-gold-700">Feedback Effectiveness</p>
                                  <p className="text-xs leading-relaxed">
                                    Average improvement per feedback provided. 
                                    Calculated as: (Overall Improvement / Total Feedback Count). 
                                    Higher values indicate each piece of feedback has a greater impact on AI learning.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <p className="text-2xl font-bold text-blue-600">
                              {improvementMetrics.feedbackEffectiveness?.toFixed(2) || 0}%
                            </p>
                            <p className="text-xs text-gray-500 mt-1">per feedback</p>
                          </div>
                        </TooltipProvider>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Improvement by Message Batch */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  <Card className="bg-white/70 backdrop-blur-xl border-2 border-gold-300/60 shadow-xl shadow-gold-300/20">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-2">
                          <LineChart className="h-5 w-5 text-gold-600" />
                          Improvement by Message Batch (Every 5 Messages)
                        </CardTitle>
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-gray-400 hover:text-gold-600 cursor-help transition-colors" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="font-semibold mb-1 text-gold-700">Improvement by Message Batch</p>
                            <p className="text-xs leading-relaxed">
                              Shows flagged message rate for each batch of 5 messages. 
                              Recent batches (last 5) are highlighted in green. 
                              A downward trend indicates the AI is learning from feedback and improving over time.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <CardDescription className="text-sm text-gray-600">
                        Shows how flagged rate decreases as the AI learns from feedback over time
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-80 flex items-end justify-between gap-1">
                        {improvementMetrics.improvementByBatch?.map((batch, index) => {
                          const maxRate = Math.max(...improvementMetrics.improvementByBatch.map(b => b.flaggedRate), 1);
                          // Ultra-aggressive scaling for small datasets - make every small difference visible
                          // For percentage rates, use extreme zoom for small values
                          let scaleFactor = 1;
                          let minHeight = 0;
                          if (maxRate <= 10) {
                              // Extreme zoom: each 1% = 8% of chart height
                              scaleFactor = 8;
                              minHeight = batch.flaggedRate > 0 ? 75 : 0; // 75% minimum for any non-zero
                            } else if (maxRate <= 25) {
                              // Strong zoom: each 1% = 4% of chart height
                              scaleFactor = 4;
                              minHeight = batch.flaggedRate > 0 ? 70 : 0; // 70% minimum for any non-zero
                            } else if (maxRate <= 50) {
                              // Moderate zoom: each 1% = 2% of chart height
                              scaleFactor = 2;
                              minHeight = batch.flaggedRate > 0 ? 60 : 0; // 60% minimum for any non-zero
                            } else {
                              // Normal scaling for larger datasets
                              scaleFactor = 100 / maxRate;
                              minHeight = batch.flaggedRate > 0 ? 30 : 0;
                            }
                            const baseHeight = batch.flaggedRate * scaleFactor;
                            const height = Math.max(baseHeight, minHeight);
                          const isRecent = index >= improvementMetrics.improvementByBatch.length - 5;
                          
                          return (
                            <div key={batch.batch} className="flex-1 flex flex-col items-center gap-1 group relative">
                              <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: `${height}%` }}
                                transition={{ duration: 0.5, delay: index * 0.02 }}
                                className={`w-full rounded-t transition-all ${
                                  isRecent 
                                    ? 'bg-gradient-to-t from-green-500 to-green-400' 
                                    : 'bg-gradient-to-t from-amber-500 to-amber-400'
                                } opacity-80 hover:opacity-100 group-hover:shadow-lg`}
                                style={{ minHeight: batch.flaggedRate > 0 ? '4px' : '0' }}
                              />
                              {index % 3 === 0 && (
                                <span className="text-xs text-gray-500 transform -rotate-45 origin-top-left whitespace-nowrap">
                                  Batch {batch.batch}
                                </span>
                              )}
                              <div className="hidden group-hover:block absolute -top-12 bg-gray-900 text-white text-xs px-2 py-1 rounded z-10 whitespace-nowrap">
                                <div>Batch {batch.batch}</div>
                                <div>Rate: {batch.flaggedRate.toFixed(1)}%</div>
                                <div>Feedback: {batch.feedbackCount}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-gold-200/50">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-amber-500 rounded"></div>
                          <span className="text-xs text-gray-600">Earlier Batches</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-green-500 rounded"></div>
                          <span className="text-xs text-gray-600">Recent Batches (Last 5)</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Daily Improvement with Feedback Correlation */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                >
                  <Card className="bg-white/70 backdrop-blur-xl border-2 border-purple-300/60 shadow-xl shadow-purple-300/20">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-2">
                          <Brain className="h-5 w-5 text-purple-600" />
                          Daily Improvement & Feedback Correlation (Last 30 Days)
                        </CardTitle>
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-gray-400 hover:text-gold-600 cursor-help transition-colors" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="font-semibold mb-1 text-gold-700">Daily Improvement & Feedback Correlation</p>
                            <p className="text-xs leading-relaxed">
                              Shows daily flagged message rates (bars) alongside cumulative feedback count (purple line). 
                              As cumulative feedback increases, flagged rates should decrease, demonstrating that the AI is learning from human feedback over time.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <CardDescription className="text-sm text-gray-600">
                        Shows how flagged rates decrease as cumulative feedback increases
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-80 flex items-end justify-between gap-1">
                        {improvementMetrics.improvementByDay?.map((day, index) => {
                          const maxRate = Math.max(...improvementMetrics.improvementByDay.map(d => d.flaggedRate), 1);
                          const maxFeedback = Math.max(...improvementMetrics.improvementByDay.map(d => d.cumulativeFeedback), 1);
                          // Ultra-aggressive scaling for flagged rate bars
                          let rateScaleFactor = 1;
                          let rateMinHeight = 0;
                          if (maxRate <= 10) {
                              // Extreme zoom: each 1% = 8% of chart height
                              rateScaleFactor = 8;
                              rateMinHeight = day.flaggedRate > 0 ? 75 : 0; // 75% minimum for any non-zero
                            } else if (maxRate <= 25) {
                              // Strong zoom: each 1% = 4% of chart height
                              rateScaleFactor = 4;
                              rateMinHeight = day.flaggedRate > 0 ? 70 : 0; // 70% minimum for any non-zero
                            } else if (maxRate <= 50) {
                              // Moderate zoom: each 1% = 2% of chart height
                              rateScaleFactor = 2;
                              rateMinHeight = day.flaggedRate > 0 ? 60 : 0; // 60% minimum for any non-zero
                            } else {
                              // Normal scaling for larger datasets
                              rateScaleFactor = 100 / maxRate;
                              rateMinHeight = day.flaggedRate > 0 ? 30 : 0;
                            }
                            const rateBaseHeight = day.flaggedRate * rateScaleFactor;
                            const height = Math.max(rateBaseHeight, rateMinHeight);
                          // Ultra-aggressive scaling for feedback bars
                          let feedbackScaleFactor = 1;
                          let feedbackMinHeight = 0;
                          if (maxFeedback <= 2) {
                              // Extreme zoom: each unit = 15% of chart height
                              feedbackScaleFactor = 15;
                              feedbackMinHeight = day.cumulativeFeedback > 0 ? 80 : 0; // 80% minimum for any non-zero
                            } else if (maxFeedback <= 5) {
                              // Strong zoom: each unit = 6% of chart height
                              feedbackScaleFactor = 6;
                              feedbackMinHeight = day.cumulativeFeedback > 0 ? 70 : 0; // 70% minimum for any non-zero
                            } else if (maxFeedback <= 10) {
                              // Moderate zoom: each unit = 3% of chart height
                              feedbackScaleFactor = 3;
                              feedbackMinHeight = day.cumulativeFeedback > 0 ? 60 : 0; // 60% minimum for any non-zero
                            } else {
                              // Normal scaling for larger datasets
                              feedbackScaleFactor = 30 / maxFeedback;
                              feedbackMinHeight = day.cumulativeFeedback > 0 ? 20 : 0;
                            }
                            const feedbackBaseHeight = day.cumulativeFeedback * feedbackScaleFactor;
                            const feedbackHeight = Math.max(feedbackBaseHeight, feedbackMinHeight);
                          const isRecent = index >= improvementMetrics.improvementByDay.length - 7;
                          
                          return (
                            <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                              <div className="w-full flex items-end gap-0.5">
                                <motion.div
                                  initial={{ height: 0 }}
                                  animate={{ height: `${height}%` }}
                                  transition={{ duration: 0.5, delay: index * 0.02 }}
                                  className={`flex-1 rounded-t transition-all ${
                                    isRecent 
                                      ? 'bg-gradient-to-t from-green-500 to-green-400' 
                                      : 'bg-gradient-to-t from-amber-500 to-amber-400'
                                  } opacity-80 hover:opacity-100 group-hover:shadow-lg`}
                                  style={{ minHeight: day.flaggedRate > 0 ? '4px' : '0' }}
                                />
                                <motion.div
                                  initial={{ height: 0 }}
                                  animate={{ height: `${feedbackHeight}%` }}
                                  transition={{ duration: 0.5, delay: index * 0.02 + 0.1 }}
                                  className="w-1 bg-gradient-to-t from-purple-500 to-purple-400 rounded-t opacity-60"
                                  style={{ minHeight: day.cumulativeFeedback > 0 ? '2px' : '0' }}
                                />
                              </div>
                              {index % 5 === 0 && (
                                <span className="text-xs text-gray-500 transform -rotate-45 origin-top-left whitespace-nowrap">
                                  {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              )}
                              <div className="hidden group-hover:block absolute -top-16 bg-gray-900 text-white text-xs px-2 py-1 rounded z-10 whitespace-nowrap">
                                <div>Date: {day.date}</div>
                                <div>Flagged Rate: {day.flaggedRate.toFixed(1)}%</div>
                                <div>Feedback: {day.cumulativeFeedback}</div>
                                <div>New Feedback: {day.feedbackCount}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-purple-200/50">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-amber-500 rounded"></div>
                          <span className="text-xs text-gray-600">Flagged Rate (Earlier)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-green-500 rounded"></div>
                          <span className="text-xs text-gray-600">Flagged Rate (Recent)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-4 bg-purple-500 rounded"></div>
                          <span className="text-xs text-gray-600">Cumulative Feedback</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Key Metrics */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 }}
                  className="grid md:grid-cols-2 gap-6"
                >
                    <Card className="bg-white/70 backdrop-blur-xl border-2 border-blue-300/60 shadow-xl shadow-blue-300/20">
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg font-bold text-gray-800">Total Feedback Provided</CardTitle>
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 text-gray-400 hover:text-gold-600 cursor-help transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-semibold mb-1 text-gold-700">Total Feedback Provided</p>
                              <p className="text-xs leading-relaxed">
                                Total number of feedback entries stored in the database that the AI uses for learning. 
                                Each feedback entry contains the original user prompt, unsafe response, human feedback, and corrected response.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <CardDescription className="text-sm text-gray-600">
                          Human feedback that the AI has learned from
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent">
                          {improvementMetrics.totalFeedback || 0}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-white/70 backdrop-blur-xl border-2 border-indigo-300/60 shadow-xl shadow-indigo-300/20">
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg font-bold text-gray-800">Learning from Feedback</CardTitle>
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 text-gray-400 hover:text-gold-600 cursor-help transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-semibold mb-1 text-gold-700">Learning from Feedback</p>
                              <p className="text-xs leading-relaxed">
                                Percentage improvement in flagged rate comparing batches after feedback was provided to batches before feedback. 
                                Positive values indicate the AI is learning from human feedback.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <CardDescription className="text-sm text-gray-600">
                          AI improvement after feedback
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className={`text-4xl font-bold bg-clip-text text-transparent ${
                          improvementMetrics.feedbackLearningRate > 0 
                            ? 'bg-gradient-to-r from-green-600 to-emerald-600' 
                            : improvementMetrics.feedbackLearningRate < 0
                            ? 'bg-gradient-to-r from-red-600 to-orange-600'
                            : 'bg-gradient-to-r from-gray-600 to-gray-400'
                        }`}>
                          {improvementMetrics.feedbackLearningRate > 0 ? '+' : ''}
                          {improvementMetrics.feedbackLearningRate?.toFixed(1) || 0}%
                        </div>
                      </CardContent>
                    </Card>
                </motion.div>
              </div>
              </TooltipProvider>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <Card className="bg-white/60 backdrop-blur-xl border-2 border-gold-200/50 shadow-lg shadow-gold-200/20">
                  <CardContent className="py-16 text-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="rounded-full h-12 w-12 border-4 border-gold-500 border-t-transparent mx-auto mb-4"
                    />
                    <p className="text-gray-600">Loading improvement metrics...</p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </TabsContent>
        </Tabs>

        {/* Review Dialog with enhanced styling */}
        <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] bg-white/95 backdrop-blur-xl border-2 border-gold-300/60 shadow-2xl shadow-gold-400/30 flex flex-col">
            <DialogHeader className="border-b border-gold-200/50 pb-4 flex-shrink-0">
              <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-gold-600 to-gold-500 bg-clip-text text-transparent flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-gold-100 to-gold-50 rounded-lg border border-gold-200/50">
                  <Shield className="h-6 w-6 text-gold-600" />
                </div>
                Review Flagged Message
              </DialogTitle>
              <DialogDescription className="text-gray-600 font-medium mt-2">
                Review the AI response and provide your judgment
              </DialogDescription>
            </DialogHeader>
            {selectedMessage && (
              <div className="space-y-6 py-4 overflow-y-auto flex-1 min-h-0">
                <div>
                  <Label className="text-sm font-bold mb-3 block text-gray-700 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Original AI Response
                  </Label>
                  <Card className="p-4 bg-gradient-to-br from-amber-50/80 to-amber-100/50 backdrop-blur-sm border-2 border-amber-300/60 shadow-md">
                    <p className="text-sm text-gray-800 leading-relaxed">{selectedMessage.content}</p>
                  </Card>
                </div>
                <div>
                  <Label className="text-sm font-bold mb-3 block text-gray-700">Verdict</Label>
                  <Select value={verdict} onValueChange={setVerdict}>
                    <SelectTrigger className="mt-2 bg-white/80 backdrop-blur-sm border-2 border-gold-200/50 focus:border-gold-400/70 focus:ring-2 focus:ring-gold-300/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white/95 backdrop-blur-xl border-2 border-gold-200/50">
                      <SelectItem value="safe">Safe - Release Original</SelectItem>
                      <SelectItem value="unsafe">Unsafe - Needs Correction</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {verdict === 'unsafe' && (
                  <>
                    <div>
                      <Label className="text-sm font-bold mb-3 block text-gray-700 flex items-center gap-2">
                        <Shield className="h-4 w-4 text-blue-600" />
                        Feedback (Required)
                      </Label>
                      <Textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        className="mt-2 bg-white/80 backdrop-blur-sm border-2 border-gold-200/50 focus:border-gold-400/70 focus:ring-2 focus:ring-gold-300/30 min-h-[100px]"
                        placeholder="What was wrong with this response? This will be used to generate a corrected response."
                        disabled={generatingResponse}
                      />
                      <p className="text-xs text-muted-foreground mt-2 font-medium">
                        Provide feedback, then click "Generate Corrected Response" to create an AI-generated correction.
                      </p>
                    </div>
                    {!responseGenerated && (
                      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <Button
                          type="button"
                          onClick={handleGenerateResponse}
                          disabled={!feedback.trim() || generatingResponse}
                          className="w-full mt-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg shadow-blue-500/40 hover:shadow-xl hover:shadow-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {generatingResponse ? (
                            <>
                              <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                className="rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"
                              />
                              Generating Response...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Generate Corrected Response
                            </>
                          )}
                        </Button>
                      </motion.div>
                    )}
                    {generatingResponse && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-4 bg-gradient-to-br from-blue-50/80 to-blue-100/50 backdrop-blur-sm border-2 border-blue-300/60 rounded-lg shadow-md mt-3"
                      >
                        <div className="flex items-center gap-3">
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            className="rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent"
                          />
                          <p className="text-sm text-blue-800 font-medium">
                            Generating corrected response using AI based on your feedback...
                          </p>
                        </div>
                      </motion.div>
                    )}
                    {correctedResponse && !generatingResponse && responseGenerated && (
                      <div>
                        <Label className="text-sm font-bold mb-3 block text-gray-700 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-green-600" />
                          Generated Corrected Response
                        </Label>
                        <Textarea
                          value={correctedResponse}
                          onChange={(e) => setCorrectedResponse(e.target.value)}
                          className="mt-2 min-h-[150px] bg-white/80 backdrop-blur-sm border-2 border-green-300/60 focus:border-green-400/70 focus:ring-2 focus:ring-green-300/30"
                          placeholder="Corrected response will appear here..."
                        />
                        <div className="flex gap-2 mt-3">
                          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setCorrectedResponse('');
                                setResponseGenerated(false);
                              }}
                              className="bg-white/60 backdrop-blur-sm border-2 border-gray-300/50 hover:bg-white/80"
                            >
                              Edit Feedback & Regenerate
                            </Button>
                          </motion.div>
                          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                            <Button
                              type="button"
                              onClick={handleGenerateResponse}
                              disabled={!feedback.trim() || generatingResponse}
                              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg shadow-blue-500/40 hover:shadow-xl hover:shadow-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Regenerate Response
                            </Button>
                          </motion.div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 font-medium">
                          Review the generated response. You can edit it manually if needed. Click "Accept & Submit Review" when satisfied.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            <DialogFooter className="border-t border-gold-200/50 pt-4 mt-4 flex-shrink-0">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setReviewDialogOpen(false);
                    setCorrectedResponse('');
                    setResponseGenerated(false);
                  }}
                  className="bg-white/60 backdrop-blur-sm border-2 border-gold-200/50 hover:bg-white/80 hover:shadow-md hover:shadow-gold-300/30"
                >
                  Cancel
                </Button>
              </motion.div>
              {verdict === 'unsafe' && responseGenerated && (
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    variant="gold"
                    onClick={handleReview}
                    disabled={loading || !correctedResponse.trim()}
                    className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-lg shadow-green-500/40 hover:shadow-xl hover:shadow-green-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {loading ? 'Submitting...' : 'Accept & Submit Review'}
                  </Button>
                </motion.div>
              )}
              {verdict === 'safe' && (
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    variant="gold"
                    onClick={handleReview}
                    disabled={loading}
                    className="bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 shadow-lg shadow-gold-500/40 hover:shadow-xl hover:shadow-gold-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Submitting...' : 'Submit Review'}
                  </Button>
                </motion.div>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
    </TooltipProvider>
  );
}
