import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext({ user: null, loading: true, recovery: false });

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, loading: true, recovery: false });
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) =>
      setState((s) => ({ ...s, user: data.session?.user ?? null, loading: false })),
    );
    const { data } = supabase.auth.onAuthStateChange((event, session) =>
      setState((s) => ({
        user: session?.user ?? null,
        loading: false,
        recovery: event === 'PASSWORD_RECOVERY' ? true : event === 'SIGNED_OUT' ? false : s.recovery,
      })),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
export const useUser = () => useContext(AuthContext).user;
