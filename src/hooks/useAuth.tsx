/**
 * useAuth Hook and AuthProvider
 *
 * Provides authentication state and methods throughout the app.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { supabase } from '../services/supabase';
import {
  getCurrentUser,
  signOut as authSignOut,
  type User,
} from '../domain/auth';
import {
  registerForPushNotifications,
  unregisterFromPushNotifications,
} from '../services/notifications';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const currentUser = await getCurrentUser();
    setUser(currentUser);
  }, []);

  useEffect(() => {
    // Initial user fetch
    const initAuth = async () => {
      await refreshUser();
      setIsLoading(false);
    };

    initAuth();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          createdAt: session.user.created_at || new Date().toISOString(),
        });
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshUser]);

  // Ward 5: register this device for SOS alerts whenever there is a session.
  //
  // Unconditionally, on every run: push_tokens is sealed, so the client cannot
  // read back what is stored and has no way to tell whether it is current.
  // Re-registering is idempotent -- the database function upserts on the token.
  useEffect(() => {
    if (!user) return;

    // Fire and forget. Notifications are a convenience: an SOS is recorded and
    // visible in the app regardless, so a failure here must not block the
    // session or surface as an error.
    registerForPushNotifications();
  }, [user]);

  const signOut = useCallback(async () => {
    // Forget this device first, while the session is still valid -- removing a
    // token needs an authenticated call. A shared phone must stop receiving
    // alerts for an account that has left it.
    await unregisterFromPushNotifications();
    await authSignOut();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      signOut,
      refreshUser,
    }),
    [user, isLoading, signOut, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
