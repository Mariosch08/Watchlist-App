import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { takeSignOutReason } from '../lib/authFlags.js';
import { resetImport } from '../lib/importRunner.js';
import { queryClient } from '../lib/queryClient.js';
import { authUrlError, supabase } from '../lib/supabase.js';

const AuthContext = createContext({ user: null, loading: true, recovery: false, signedOutReason: null, urlError: null });

// Friends invited through the Supabase dashboard have no password yet.
export const needsPassword = (user) => Boolean(user?.invited_at) && !user?.user_metadata?.password_set;

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, loading: true, recovery: false, signedOutReason: null, urlError: authUrlError });
  const userId = useRef(undefined);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null;
      const nextId = user?.id ?? null;
      // Account changed or signed out: never show the previous user's cached data.
      if (userId.current !== undefined && userId.current !== nextId) {
        queryClient.clear();
        resetImport();
      }
      const wasSignedIn = Boolean(userId.current);
      userId.current = nextId;
      setState((s) => ({
        // Keep the same object on token refresh so consumers do not re-render every hour.
        user: s.user && user && s.user.id === user.id && event === 'TOKEN_REFRESHED' ? s.user : user,
        loading: false,
        recovery: event === 'PASSWORD_RECOVERY' ? true : event === 'SIGNED_OUT' || event === 'USER_UPDATED' ? false : s.recovery,
        signedOutReason: event === 'SIGNED_OUT' && wasSignedIn ? (takeSignOutReason() ?? 'expired') : event === 'SIGNED_IN' ? null : s.signedOutReason,
        urlError: s.urlError,
      }));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
export const useUser = () => useContext(AuthContext).user;
