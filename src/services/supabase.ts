/**
 * Supabase Client Configuration
 *
 * This module initializes and exports the Supabase client.
 * Configuration is loaded from environment variables.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env';

export const supabase = createClient(
  config.supabaseUrl,
  config.supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
