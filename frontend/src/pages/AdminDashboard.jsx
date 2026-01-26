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
import { getFlaggedMessages, reviewMessage, getMetrics } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [flaggedMessages, setFlaggedMessages] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [verdict, setVerdict] = useState('safe');
  const [feedback, setFeedback] = useState('');
  const [correctedResponse, setCorrectedResponse] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/chat');
      return;
    }
    loadData();
    const interval = setInterval(loadData, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [user]);

  async function loadData() {
    try {
      const [flaggedRes, metricsRes] = await Promise.all([
        getFlaggedMessages(),
        getMetrics(),
      ]);
      setFlaggedMessages(flaggedRes.messages || []);
      setMetrics(metricsRes);
    } catch (error) {
      console.error('Error loading data:', error);
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
      await loadData();
    } catch (error) {
      console.error('Error reviewing message:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit review',
        variant: 'destructive',
      });
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
                      <Label>Corrected Response</Label>
                      <Textarea
                        value={correctedResponse}
                        onChange={(e) => setCorrectedResponse(e.target.value)}
                        className="mt-2 min-h-[120px]"
                        placeholder="Enter the corrected response..."
                      />
                    </div>
                    <div>
                      <Label>Feedback (Optional)</Label>
                      <Textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        className="mt-2"
                        placeholder="What was wrong with this response?"
                      />
                    </div>
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
                disabled={loading || (verdict === 'unsafe' && !correctedResponse.trim())}
              >
                {loading ? 'Submitting...' : 'Submit Review'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
