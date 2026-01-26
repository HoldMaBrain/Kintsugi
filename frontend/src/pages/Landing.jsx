import { motion, useScroll, useTransform } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sparkles, Heart, Shield, CheckCircle, ArrowRight, Users, Brain, Lock, Flower2, Leaf, Waves, Sun, Moon, Star, Cloud } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const { signInWithGoogle, user, loading } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef(null);
  
  // Parallax scrolling
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  });
  
  // Subtle parallax transforms
  const titleY = useTransform(scrollYProgress, [0, 1], [0, -50]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -30]);
  const featuresY = useTransform(scrollYProgress, [0, 1], [0, -20]);
  const backgroundY = useTransform(scrollYProgress, [0, 1], [0, 100]);

  // Redirect to chat if user is already authenticated
  useEffect(() => {
    if (user) {
      navigate('/chat', { replace: true });
    }
  }, [user, navigate]);

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
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-gold-50 flex items-center justify-center relative overflow-hidden">
        {/* Animated background particles */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
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

  const containerVariants = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0,
        delayChildren: 0,
        duration: 0,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0,
      },
    },
  };

  const features = [
    {
      icon: Heart,
      title: "Empathetic Support",
      description: "Connect with an AI assistant designed to listen, understand, and support your emotional journey.",
      color: "text-rose-500",
      bgColor: "bg-rose-50",
    },
    {
      icon: Shield,
      title: "Safety First",
      description: "Every interaction is monitored by human experts to ensure your safety and wellbeing.",
      color: "text-blue-500",
      bgColor: "bg-blue-50",
    },
    {
      icon: Sparkles,
      title: "Continuous Learning",
      description: "Our system learns from human feedback to provide better support over time.",
      color: "text-gold-600",
      bgColor: "bg-gold-50",
    },
  ];

  const benefits = [
    { icon: Users, text: "Human-in-the-loop monitoring" },
    { icon: Brain, text: "AI-powered empathetic responses" },
    { icon: Lock, text: "Privacy-focused and secure" },
    { icon: CheckCircle, text: "Continuously improving" },
  ];

  // Mental health themed floating elements - expanded with more icons
  const floatingElements = [
    { icon: Flower2, color: "text-rose-300", size: "w-16 h-16", delay: 0, duration: 8, x: "5%", y: "20%" },
    { icon: Leaf, color: "text-green-300", size: "w-12 h-12", delay: 1, duration: 10, x: "8%", y: "60%" },
    { icon: Heart, color: "text-pink-300", size: "w-14 h-14", delay: 2, duration: 9, x: "3%", y: "40%" },
    { icon: Flower2, color: "text-purple-300", size: "w-10 h-10", delay: 0.5, duration: 11, x: "92%", y: "15%" },
    { icon: Leaf, color: "text-emerald-300", size: "w-16 h-16", delay: 1.5, duration: 8, x: "95%", y: "50%" },
    { icon: Heart, color: "text-rose-200", size: "w-12 h-12", delay: 2.5, duration: 10, x: "88%", y: "75%" },
    { icon: Waves, color: "text-blue-300", size: "w-14 h-14", delay: 0.8, duration: 12, x: "2%", y: "80%" },
    { icon: Flower2, color: "text-amber-300", size: "w-11 h-11", delay: 1.2, duration: 9, x: "97%", y: "35%" },
    { icon: Sun, color: "text-yellow-300", size: "w-13 h-13", delay: 0.3, duration: 9, x: "4%", y: "10%" },
    { icon: Moon, color: "text-indigo-300", size: "w-10 h-10", delay: 1.8, duration: 11, x: "6%", y: "85%" },
    { icon: Star, color: "text-amber-200", size: "w-9 h-9", delay: 0.7, duration: 10, x: "1%", y: "55%" },
    { icon: Cloud, color: "text-sky-300", size: "w-15 h-15", delay: 1.3, duration: 13, x: "7%", y: "30%" },
    { icon: Flower2, color: "text-fuchsia-300", size: "w-11 h-11", delay: 2.2, duration: 9, x: "93%", y: "25%" },
    { icon: Leaf, color: "text-lime-300", size: "w-13 h-13", delay: 0.9, duration: 10, x: "96%", y: "65%" },
    { icon: Heart, color: "text-red-200", size: "w-10 h-10", delay: 1.6, duration: 8, x: "89%", y: "85%" },
    { icon: Star, color: "text-yellow-200", size: "w-8 h-8", delay: 2.8, duration: 12, x: "94%", y: "5%" },
    { icon: Sun, color: "text-orange-200", size: "w-12 h-12", delay: 0.4, duration: 9, x: "91%", y: "40%" },
    { icon: Waves, color: "text-cyan-300", size: "w-11 h-11", delay: 2.0, duration: 11, x: "3%", y: "70%" },
  ];

  return (
    <div ref={containerRef} className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-gold-50 relative overflow-hidden">
      {/* Animated background elements */}
      <motion.div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{ y: backgroundY }}
      >
        {/* Floating gold particles */}
        {[...Array(15)].map((_, i) => (
          <motion.div
            key={`particle-${i}`}
            className="absolute w-1 h-1 bg-gold-400/40 rounded-full"
            initial={{
              x: typeof window !== 'undefined' ? Math.random() * window.innerWidth : Math.random() * 1920,
              y: typeof window !== 'undefined' ? Math.random() * window.innerHeight : Math.random() * 1080,
            }}
            animate={{
              y: [null, (Math.random() - 0.5) * 150],
              x: [null, (Math.random() - 0.5) * 150],
              opacity: [0.2, 0.5, 0.2],
            }}
            transition={{
              duration: Math.random() * 6 + 5, // Slower particles
              repeat: Infinity,
              delay: Math.random() * 2,
              ease: [0.4, 0, 0.6, 1], // Gentle motion
            }}
          />
        ))}
        
        {/* Mental health themed floating elements on the sides */}
        {floatingElements.map((element, i) => {
          const Icon = element.icon;
          return (
            <motion.div
              key={`floating-${i}`}
              className={`absolute ${element.size} ${element.color} opacity-30`}
              style={{
                left: element.x,
                top: element.y,
              }}
              animate={{
                y: [null, -20, 20, -15, 15, 0],
                x: [null, -8, 8, -4, 4, 0],
                rotate: [0, 3, -3, 2, -2, 0],
                opacity: [0.25, 0.35, 0.3, 0.32, 0.28, 0.3],
              }}
              transition={{
                duration: element.duration * 1.5, // Slower movement
                repeat: Infinity,
                delay: element.delay,
                ease: [0.4, 0, 0.6, 1], // Gentle breathing motion
              }}
            >
              <Icon className="w-full h-full" />
            </motion.div>
          );
        })}
        
        {/* Large decorative circles */}
        <motion.div
          className="absolute -top-40 -right-40 w-96 h-96 bg-gold-200/20 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.3, 0.45, 0.3],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: [0.4, 0, 0.6, 1],
          }}
        />
        <motion.div
          className="absolute -bottom-40 -left-40 w-96 h-96 bg-amber-200/20 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.45, 0.3],
          }}
          transition={{
            duration: 14,
            repeat: Infinity,
            ease: [0.4, 0, 0.6, 1],
            delay: 1.5,
          }}
        />
      </motion.div>

      {/* Hero Section */}
      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="text-center max-w-5xl mx-auto relative">
          {/* Logo/Title with enhanced animation */}
          <motion.div
            className="mb-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, ease: [0.33, 1, 0.68, 1], delay: 0.2 }}
            style={{ y: titleY }}
          >
            <h1 className="text-7xl md:text-8xl lg:text-9xl font-bold mb-6 relative">
              <span className="bg-gradient-to-r from-gold-600 via-gold-500 to-gold-700 bg-clip-text text-transparent relative inline-block">
                Kintsugi
                <span className="absolute -top-2 -right-2 text-4xl opacity-90">
                  ✨
                </span>
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground italic font-light">
              The art of repairing broken pottery with gold
            </p>
          </motion.div>

          {/* Main CTA with enhanced styling */}
          <motion.div
            className="mb-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, ease: [0.33, 1, 0.68, 1], delay: 0.4 }}
            style={{ y: contentY }}
          >
            <p className="text-3xl md:text-4xl lg:text-5xl text-gray-800 mb-6 leading-tight font-light">
              Healing through connection.
            </p>
            <p className="text-2xl md:text-3xl lg:text-4xl text-gold-600 font-semibold mb-10">
              Always supervised, always safe.
            </p>
          </motion.div>

          {/* Enhanced CTA Button */}
          <motion.div
            className="mb-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, ease: [0.33, 1, 0.68, 1], delay: 0.6 }}
            style={{ y: contentY }}
          >
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <Button
                size="lg"
                variant="gold"
                onClick={handleGetStarted}
                className="text-xl px-12 py-8 rounded-full shadow-2xl hover:shadow-gold-500/50 transition-all duration-300 relative overflow-hidden group"
              >
                <motion.span
                  className="absolute inset-0 bg-gradient-to-r from-gold-400 to-gold-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  initial={false}
                />
                <span className="relative flex items-center gap-3">
                  <Sparkles className="h-6 w-6" />
                  Start Your Journey
                  <ArrowRight className="h-6 w-6" />
                </span>
              </Button>
            </motion.div>
          </motion.div>

          {/* Benefits list */}
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-20 max-w-4xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, ease: [0.33, 1, 0.68, 1], delay: 0.8 }}
            style={{ y: contentY }}
          >
            {benefits.map((benefit, index) => (
              <motion.div
                key={index}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/60 backdrop-blur-sm border border-gold-200/50"
                whileHover={{ scale: 1.05, backgroundColor: "rgba(255, 255, 255, 0.9)" }}
                transition={{ duration: 0.2 }}
              >
                <benefit.icon className="h-6 w-6 text-gold-600" />
                <p className="text-sm text-center text-gray-700 font-medium">{benefit.text}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* Enhanced Features */}
          <motion.div
            className="grid md:grid-cols-3 gap-8 mt-20 mb-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, ease: [0.33, 1, 0.68, 1], delay: 1.0 }}
            style={{ y: featuresY }}
          >
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 1.0, ease: [0.33, 1, 0.68, 1], delay: 1.2 + (index * 0.1) }}
                  whileHover={{ 
                    scale: 1.05, 
                    y: -5,
                    transition: { duration: 0.2 }
                  }}
                  className="relative group"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-gold-400/20 to-amber-400/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative bg-white/90 backdrop-blur-md rounded-3xl p-8 shadow-lg border border-gold-200/50 h-full">
                    <motion.div
                      className={`w-16 h-16 ${feature.bgColor} rounded-2xl flex items-center justify-center mb-6 mx-auto`}
                      whileHover={{ rotate: [0, -10, 10, 0] }}
                      transition={{ duration: 0.5 }}
                    >
                      <Icon className={`h-8 w-8 ${feature.color}`} />
                    </motion.div>
                    <h3 className="text-2xl font-bold mb-4 text-gray-800">{feature.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Enhanced Disclaimer */}
          <motion.div
            className="mt-20 p-8 bg-gradient-to-br from-amber-100/80 to-gold-100/80 backdrop-blur-sm rounded-2xl border-2 border-amber-300/50 max-w-3xl mx-auto shadow-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, ease: [0.33, 1, 0.68, 1], delay: 1.5 }}
            style={{ y: contentY }}
          >
            <div className="flex items-start gap-4">
              <Shield className="h-6 w-6 text-amber-700 flex-shrink-0 mt-1" />
              <div className="text-left">
                <h4 className="font-semibold text-amber-900 mb-2">Important Notice</h4>
                <p className="text-sm text-gray-700 leading-relaxed">
                  Kintsugi is not a replacement for professional therapy or medical care. 
                  If you're experiencing a mental health crisis, please contact your local emergency services or a mental health professional.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
