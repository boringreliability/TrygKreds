/**
 * Environment Configuration
 *
 * Loads configuration from environment variables.
 * In development, these can be set in .env file (not committed to git).
 */

// For Expo, we use Constants.expoConfig for environment variables
// These will be replaced with actual values from .env in production

export const config = {
  // Supabase configuration
  // These should be set via environment variables in production
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',

  // App configuration
  appName: 'TrygKreds',
  appVersion: '1.0.0',
} as const;

// Validate required configuration in non-test environment
if (process.env.NODE_ENV !== 'test') {
  if (config.supabaseUrl === 'https://placeholder.supabase.co') {
    // eslint-disable-next-line no-console
    console.warn('Warning: EXPO_PUBLIC_SUPABASE_URL is not set');
  }
  if (config.supabaseAnonKey === 'placeholder-anon-key') {
    // eslint-disable-next-line no-console
    console.warn('Warning: EXPO_PUBLIC_SUPABASE_ANON_KEY is not set');
  }
}
