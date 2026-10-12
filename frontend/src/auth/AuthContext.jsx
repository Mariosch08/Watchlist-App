import { createContext, useContext, useEffect, useState } from 'react';
import { currentUser, subscribe } from './session.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(currentUser);
  useEffect(() => subscribe(setUser), []);
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

export const useUser = () => useContext(AuthContext);
