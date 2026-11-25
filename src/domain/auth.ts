/**
 * Auth Domain Module
 *
 * Core authentication logic for TrygKreds.
 * Handles sign up, sign in, sign out, and user session management.
 */

import { supabase } from '../services/supabase';

// Types
export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

export interface PasswordValidationResult {
  isValid: boolean;
  error?: string;
}

export type AuthError = string;

// Email validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

// Password validation
const MIN_PASSWORD_LENGTH = 8;

export function validatePassword(password: string): PasswordValidationResult {
  if (!password) {
    return { isValid: false, error: 'Password is required' };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      isValid: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    };
  }

  return { isValid: true };
}

// Helper to map Supabase user to our User type
function mapSupabaseUser(supabaseUser: {
  id: string;
  email?: string;
  created_at?: string;
}): User {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email || '',
    createdAt: supabaseUser.created_at || new Date().toISOString(),
  };
}

// Sign up with email and password
export async function signUp(
  email: string,
  password: string,
  // Supplied by the caller rather than read from expo-linking here: this layer
  // must not import Expo. Without it the confirmation link goes to the
  // project's Site URL, which a phone cannot come back from.
  emailRedirectTo: string
): Promise<AuthResult> {
  // Validate email
  if (!validateEmail(email)) {
    return { success: false, error: 'Invalid email address' };
  }

  // Validate password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    return { success: false, error: passwordValidation.error };
  }

  // Call Supabase
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data.user) {
    return { success: false, error: 'Sign up failed' };
  }

  return {
    success: true,
    user: mapSupabaseUser(data.user),
  };
}

// Sign in with email and password
export async function signIn(
  email: string,
  password: string
): Promise<AuthResult> {
  // Validate email format
  if (!validateEmail(email)) {
    return { success: false, error: 'Invalid email address' };
  }

  // Call Supabase
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data.user) {
    return { success: false, error: 'Sign in failed' };
  }

  return {
    success: true,
    user: mapSupabaseUser(data.user),
  };
}

// Sign out
export async function signOut(): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Get current user
export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return mapSupabaseUser(data.user);
}
