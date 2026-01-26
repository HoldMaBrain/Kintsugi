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
import { ArrowLeft, Shield, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getFlaggedMessages, reviewMessage, getMetrics, getReviewedMessages } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [flaggedMessages, setFlaggedMessages] = useState([]);
  const [reviewedMessages, setReviewedMessages] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [verdict, setVerdict] = useState('safe');
  const [feedback, setFeedback] = useState('');
  const [correctedResponse, setCorrectedResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatingResponse, setGeneratingResponse] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/chat');
      return;
    }
    loadData();
    // Increase refresh interval to 30 seconds to reduce API calls
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [user]);

  async function loadData() {
    try {
      const [flaggedRes, reviewedRes, metricsRes] = await Promise.all([
        getFlaggedMessages(),
        getReviewedMessages(),
        getMetrics(),
      ]);
      setFlaggedMessages(flaggedRes.messages || []);
      setReviewedMessages(reviewedRes.messages || []);
      setMetrics(metricsRes);
    } catch (error) {
      console.error('Error loading data:', error);
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
    setCorrectedResponse(message.content || '');
    setReviewDialogOpen(true);
  }

  async function handleReview() {
    if (!selectedMessage) return;
    setLoading(true);
    setGeneratingResponse(verdict === 'unsafe');
    try {
      const result = await reviewMessage(
        selectedMessage.id,
        verdict,
        feedback || null,
        verdict === 'unsafe' ? correctedResponse : null
      );
      
      if (result.correctedResponse && verdict === 'unsafe') {
        // Update the corrected response in the dialog
        setCorrectedResponse(result.correctedResponse);
        toast({
          title: 'Success',
          description: 'Corrected response generated and saved. Review submitted successfully.',
        });
      } else {
        toast({
          title: 'Success',
          description: 'Review submitted successfully',
        });
      }
      setReviewDialogOpen(false);
      // Add a small delay before reloading to avoid rate limit issues
      setTimeout(async () => {
        await loadData();
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
          await loadData();
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
      setGeneratingResponse(false);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-gold-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/chat')}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Chat
          </Button>
          <div className="flex items-center gap-4">
            <Shield className="h-8 w-8 text-gold-600" />
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-gold-600 to-gold-500 bg-clip-text text-transparent">
                Admin Dashboard
              </h1>
              <p className="text-muted-foreground">Review and manage flagged conversations</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="flagged" className="space-y-6">
          <TabsList>
            <TabsTrigger value="flagged">
              Flagged Messages ({flaggedMessages.length})
            </TabsTrigger>
            <TabsTrigger value="reviewed">
              Reviewed Messages ({reviewedMessages.length})
            </TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
          </TabsList>

          <TabsContent value="flagged" className="space-y-4">
            {flaggedMessages.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">No flagged messages at this time</p>
                </CardContent>
              </Card>
            ) : (
              flaggedMessages.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <CardTitle className="text-lg">Flagged Message</CardTitle>
                            <Badge variant={getRiskBadgeVariant(item.risk_level)}>
                              {item.risk_level?.toUpperCase() || 'UNKNOWN'}
                            </Badge>
                          </div>
                          <CardDescription>
                            User: {item.conversations?.users?.email || 'Unknown'} •{' '}
                            {new Date(item.created_at).toLocaleString()}
                          </CardDescription>
                        </div>
                        <Button
                          variant="gold"
                          onClick={() => openReviewDialog(item)}
                        >
                          Review
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">User Message:</Label>
                        <Card className="p-3 bg-muted/50">
                          <p className="text-sm">
                            {(() => {
                              const conversation = item.conversations;
                              const messages = conversation?.messages || [];
                              const userMessage = messages
                                .filter(m => m.sender === 'user')
                                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
                              return userMessage?.content || 'N/A';
                            })()}
                          </p>
                        </Card>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">AI Response:</Label>
                        <Card className="p-3 bg-amber-50 border-amber-200">
                          <p className="text-sm">{item.content}</p>
                        </Card>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            )}
          </TabsContent>

          <TabsContent value="reviewed" className="space-y-4">
            {reviewedMessages.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">No reviewed messages yet</p>
                </CardContent>
              </Card>
            ) : (
              reviewedMessages.map((item) => {
                const review = item.reviews?.[0];
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card className="hover:shadow-lg transition-shadow">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <CardTitle className="text-lg">Reviewed Message</CardTitle>
                              <Badge variant={review?.verdict === 'unsafe' ? 'danger' : 'success'}>
                                {review?.verdict === 'unsafe' ? 'UNSAFE' : 'SAFE'}
                              </Badge>
                              {item.risk_level && (
                                <Badge variant={getRiskBadgeVariant(item.risk_level)}>
                                  {item.risk_level.toUpperCase()}
                                </Badge>
                              )}
                            </div>
                            <CardDescription>
                              User: {item.conversations?.users?.email || 'Unknown'} •{' '}
                              Reviewed by: {review?.users?.email || 'Unknown'} •{' '}
                              {new Date(item.created_at).toLocaleString()}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label className="text-sm font-semibold mb-2 block">User Message:</Label>
                          <Card className="p-3 bg-muted/50">
                            <p className="text-sm">
                              {(() => {
                                const conversation = item.conversations;
                                const messages = conversation?.messages || [];
                                const userMessage = messages
                                  .filter(m => m.sender === 'user')
                                  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                                  .find((m, idx, arr) => {
                                    const aiMessageIndex = messages.findIndex(msg => msg.id === item.id);
                                    const userMessageIndex = messages.findIndex(msg => msg.id === m.id);
                                    return userMessageIndex < aiMessageIndex && userMessageIndex >= aiMessageIndex - 1;
                                  }) || messages
                                    .filter(m => m.sender === 'user')
                                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
                                return userMessage?.content || 'N/A';
                              })()}
                            </p>
                          </Card>
                        </div>
                        <div>
                          <Label className="text-sm font-semibold mb-2 block">AI Response (Final):</Label>
                          <Card className="p-3 bg-green-50 border-green-200">
                            <p className="text-sm">{item.content}</p>
                          </Card>
                        </div>
                        {review?.feedback && (
                          <div>
                            <Label className="text-sm font-semibold mb-2 block">Admin Feedback:</Label>
                            <Card className="p-3 bg-blue-50 border-blue-200">
                              <p className="text-sm">{review.feedback}</p>
                            </Card>
                          </div>
                        )}
                        {review?.verdict === 'unsafe' && (
                          <>
                            {review.original_response && (
                              <div>
                                <Label className="text-sm font-semibold mb-2 block">Original Unsafe Response:</Label>
                                <Card className="p-3 bg-red-50 border-red-200">
                                  <p className="text-sm line-through text-muted-foreground">
                                    {review.original_response}
                                  </p>
                                </Card>
                              </div>
                            )}
                            {review.corrected_response && (
                              <div>
                                <Label className="text-sm font-semibold mb-2 block">Corrected Response:</Label>
                                <Card className="p-3 bg-green-50 border-green-200">
                                  <p className="text-sm">{review.corrected_response}</p>
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
            {metrics ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Total Messages</CardDescription>
                    <CardTitle className="text-3xl">{metrics.totalMessages || 0}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Flagged Messages</CardDescription>
                    <CardTitle className="text-3xl text-yellow-600">{metrics.flaggedCount || 0}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Flagged Percentage</CardDescription>
                    <CardTitle className="text-3xl text-orange-600">
                      {metrics.flaggedPercentage?.toFixed(1) || 0}%
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Correction Rate</CardDescription>
                    <CardTitle className="text-3xl text-red-600">
                      {metrics.correctionRate?.toFixed(1) || 0}%
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Risk Distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">High Risk</span>
                        <Badge variant="danger">{metrics.highRiskCount || 0}</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Medium Risk</span>
                        <Badge variant="warning">{metrics.mediumRiskCount || 0}</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Total Reviews</span>
                        <Badge variant="secondary">{metrics.totalReviews || 0}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">Loading metrics...</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Review Dialog */}
        <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Review Flagged Message</DialogTitle>
              <DialogDescription>
                Review the AI response and provide your judgment
              </DialogDescription>
            </DialogHeader>
            {selectedMessage && (
              <div className="space-y-4">
                <div>
                  <Label>Original AI Response</Label>
                  <Card className="p-3 bg-muted/50 mt-2">
                    <p className="text-sm">{selectedMessage.content}</p>
                  </Card>
                </div>
                <div>
                  <Label>Verdict</Label>
                  <Select value={verdict} onValueChange={setVerdict}>
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="safe">Safe - Release Original</SelectItem>
                      <SelectItem value="unsafe">Unsafe - Needs Correction</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {verdict === 'unsafe' && (
                  <>
                    <div>
                      <Label>Feedback (Required)</Label>
                      <Textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        className="mt-2"
                        placeholder="What was wrong with this response? This will be used to generate a corrected response."
                        disabled={generatingResponse}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        A corrected response will be automatically generated based on your feedback.
                      </p>
                    </div>
                    {generatingResponse && (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800">
                          Generating corrected response using AI based on your feedback...
                        </p>
                      </div>
                    )}
                    {correctedResponse && !generatingResponse && (
                      <div>
                        <Label>Generated Corrected Response</Label>
                        <Textarea
                          value={correctedResponse}
                          onChange={(e) => setCorrectedResponse(e.target.value)}
                          className="mt-2 min-h-[120px]"
                          placeholder="Corrected response will appear here..."
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          You can edit this response if needed before submitting.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="gold"
                onClick={handleReview}
                disabled={loading || generatingResponse || (verdict === 'unsafe' && !feedback.trim())}
              >
                {generatingResponse ? 'Generating Response...' : loading ? 'Submitting...' : 'Submit Review'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
