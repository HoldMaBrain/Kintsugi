import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getUser } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    // Get initial session - don't wait for backend
    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Error getting session:', error);
          if (mounted) setLoading(false);
          return;
        }
        
        if (session && session.user) {
          // Immediately set user from session to enable redirect
          // Backend user data will be loaded in background
          if (mounted) {
            setUser({
              id: session.user.id,
              email: session.user.email,
              role: 'user', // Default, will be updated by backend
            });
            setLoading(false); // Set loading false immediately for redirect
          }
          
          // Load full user data from backend in background (non-blocking)
          loadUser(session.user.email).catch(err => {
            console.warn('Background user load failed:', err);
            // User is already set from session, so this is fine
          });
        } else {
          if (mounted) setLoading(false);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        if (mounted) setLoading(false);
      }
    };

    // Set a shorter timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      if (mounted) {
        console.warn('Auth loading timeout - setting loading to false');
        setLoading(false);
      }
    }, 2000); // 2 second timeout (reduced from 5)

    initAuth();

    // Listen for auth changes (including OAuth callbacks)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);
      if (session && session.user) {
        // Immediately set user from session for instant redirect
        if (mounted) {
          setUser({
            id: session.user.id,
            email: session.user.email,
            role: 'user', // Default, will be updated by backend
          });
          setLoading(false);
        }
        
        // Load full user data from backend in background
        loadUser(session.user.email).catch(err => {
          console.warn('Background user load failed:', err);
        });
      } else {
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  async function loadUser(email) {
    try {
      // Add timeout to getUser to prevent hanging
      const getUserPromise = getUser();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('getUser timeout')), 3000)
      );
      
      const { user: userData } = await Promise.race([
        getUserPromise,
        timeoutPromise
      ]);
      
      setUser(userData);
      // Don't set loading here - it's already set to false in initAuth
    } catch (error) {
      console.warn('Error loading user from backend:', error);
      // If backend fails, user is already set from session in initAuth
      // This is fine - backend will create/update user on first API call
    }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/chat`,
      },
    });
    if (error) throw error;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
