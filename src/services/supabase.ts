/**
 * Supabase Client Configuration
 *
 * This module initializes and exports the Supabase client.
 * Configuration is loaded from environment variables.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env';
import { sessionStorage } from './sessionStorage';

export const supabase = createClient(
  config.supabaseUrl,
  config.supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      // Where the session actually goes. Without this, supabase-js falls back to
      // memory on React Native and the session dies with the app.
      storage: sessionStorage,
      // PKCE rather than the implicit flow: the confirmation link then carries a
      // single-use code instead of the tokens themselves, which would otherwise
      // travel in a URL fragment and can reach logs and browser history.
      flowType: 'pkce',
      // No URL to find a session in on native.
      detectSessionInUrl: false,
    },
  }
);
