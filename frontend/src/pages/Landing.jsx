import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sparkles, Heart, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const { signInWithGoogle, user, loading } = useAuth();
  const navigate = useNavigate();

  // Redirect to chat if user is already authenticated
  useEffect(() => {
    if (!loading && user) {
      navigate('/chat', { replace: true });
    }
  }, [user, loading, navigate]);

  const handleGetStarted = () => {
    if (user) {
      navigate('/chat');
    } else {
      signInWithGoogle();
    }
  };

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-gold-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-gold-50">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-4xl mx-auto"
        >
          {/* Logo/Title */}
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-8"
          >
            <h1 className="text-6xl md:text-7xl font-bold mb-4 bg-gradient-to-r from-gold-600 via-gold-500 to-gold-700 bg-clip-text text-transparent">
              Kintsugi
            </h1>
            <p className="text-xl text-muted-foreground italic">
              The art of repairing broken pottery with gold
            </p>
          </motion.div>

          {/* Main CTA */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-2xl md:text-3xl text-gray-800 mb-8 leading-relaxed"
          >
            Healing through connection. <br />
            <span className="text-gold-600 font-semibold">Always supervised, always safe.</span>
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mb-16"
          >
            <Button
              size="lg"
              variant="gold"
              onClick={handleGetStarted}
              className="text-lg px-8 py-6 rounded-full shadow-lg hover:shadow-xl transition-all"
            >
              <Sparkles className="mr-2 h-5 w-5" />
              Start Your Journey
            </Button>
          </motion.div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="grid md:grid-cols-3 gap-8 mt-20"
          >
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-md border border-gold-200"
            >
              <Heart className="h-12 w-12 text-gold-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Empathetic Support</h3>
              <p className="text-muted-foreground">
                Connect with an AI assistant designed to listen, understand, and support your emotional journey.
              </p>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.05 }}
              className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-md border border-gold-200"
            >
              <Shield className="h-12 w-12 text-gold-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Safety First</h3>
              <p className="text-muted-foreground">
                Every interaction is monitored by human experts to ensure your safety and wellbeing.
              </p>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.05 }}
              className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-md border border-gold-200"
            >
              <Sparkles className="h-12 w-12 text-gold-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Continuous Learning</h3>
              <p className="text-muted-foreground">
                Our system learns from human feedback to provide better support over time.
              </p>
            </motion.div>
          </motion.div>

          {/* Disclaimer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-16 p-6 bg-amber-100/50 rounded-lg border border-amber-200 max-w-2xl mx-auto"
          >
            <p className="text-sm text-gray-700">
              <strong>Important:</strong> Kintsugi is not a replacement for professional therapy or medical care. 
              If you're experiencing a mental health crisis, please contact your local emergency services or a mental health professional.
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
