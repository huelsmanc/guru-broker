import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { base44, supabase } from '@/api/base44Client';
import { secondStepStatus } from '@/lib/twoStep';

const AuthContext = createContext();

const PUBLIC_PATHS = ['/sign', '/verify', '/custom-sign', '/BulkSign', '/review', '/login', '/reset-password', '/status', '/portal', '/privacy', '/support'];

// Records a sign-in in the admin Activity feed (at most once every 8 hours per browser,
// since Supabase also reports SIGNED_IN when a tab wakes up).
function logSignIn() {
  setTimeout(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const id = data?.session?.user?.id;
      if (!id) return;
      const k = `gbh_signin_${id}`;
      const last = Number(localStorage.getItem(k) || 0);
      if (Date.now() - last < 8 * 3600 * 1000) return;
      localStorage.setItem(k, String(Date.now()));
      await base44.functions.invoke('trackEvent', { event: 'signed_in', summary: navigator.userAgent.slice(0, 120) });
    } catch { /* never block sign-in */ }
  }, 0);
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const isPublicRoute = () => PUBLIC_PATHS.includes(window.location.pathname);

  // Only the first check shows the loading screen. Later checks (Supabase re-confirms the
  // session whenever the tab comes back into view) update quietly, so open pages and
  // half-finished forms stay where they are.
  const checked = useRef(false);
  const signedInAs = useRef(null);
  const checkUserAuth = useCallback(async () => {
    if (!checked.current) setIsLoadingAuth(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
        return;
      }
      signedInAs.current = data.session.user?.id || signedInAs.current;
      const currentUser = await base44.auth.me();
      if (currentUser.suspended) {
        await supabase.auth.signOut();
        setAuthError({ type: 'user_not_registered', message: 'This account is suspended' });
        return;
      }
      setUser((prev) => (prev && JSON.stringify(prev) === JSON.stringify(currentUser) ? prev : currentUser));
      // 2-step sign-in: stop here until this sign-in is confirmed. (If the check itself can't be
      // reached, carry on: the database still holds back data until the step is done.)
      const step = await secondStepStatus(currentUser.id).catch((e) => (e?.status === 401 && e?.data?.code !== 'second_step_required' ? Promise.reject(e) : null));
      if (step?.needed && !step.ok) {
        setIsAuthenticated(false);
        setAuthError({ type: 'second_step', message: 'Confirm the second sign-in step', status: step });
        return;
      }
      setIsAuthenticated(true);
      setAuthError(null);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: 'Authentication required' });
    } finally {
      checked.current = true;
      setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    if (isPublicRoute()) {
      setIsLoadingAuth(false);
      return;
    }
    checkUserAuth();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        signedInAs.current = null;
        setUser(null);
        setIsAuthenticated(false);
      } else if (event === 'MFA_CHALLENGE_VERIFIED') {
        // The gate re-checks itself after the code; nothing to do here.
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Supabase also sends SIGNED_IN when the tab regains focus; only a real new sign-in
        // (a different person, or no one before) is logged as one.
        const id = session?.user?.id || null;
        const isNew = event === 'SIGNED_IN' && id && signedInAs.current !== id;
        signedInAs.current = id || signedInAs.current;
        if (isNew || event === 'USER_UPDATED' || !checked.current) checkUserAuth();
        if (isNew && checked.current) logSignIn();
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
