import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { base44, supabase } from '@/api/base44Client';

const AuthContext = createContext();

const PUBLIC_PATHS = ['/sign', '/custom-sign', '/BulkSign', '/review', '/login', '/reset-password'];

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const isPublicRoute = () => PUBLIC_PATHS.includes(window.location.pathname);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
        return;
      }
      const currentUser = await base44.auth.me();
      if (currentUser.suspended) {
        await supabase.auth.signOut();
        setAuthError({ type: 'user_not_registered', message: 'This account is suspended' });
        return;
      }
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: 'Authentication required' });
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    if (isPublicRoute()) {
      setIsLoadingAuth(false);
      return;
    }
    checkUserAuth();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsAuthenticated(false);
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        checkUserAuth();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [checkUserAuth]);

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    base44.auth.logout(shouldRedirect ? '/login' : undefined);
  };

  const navigateToLogin = () => {
    base44.auth.redirectToLogin(window.location.pathname + window.location.search);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError,
      appPublicSettings: null,
      logout,
      navigateToLogin,
      checkAppState: checkUserAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
