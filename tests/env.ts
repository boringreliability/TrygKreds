/**
 * Sets the Expo public variables before any test module is required.
 *
 * src/config/env.ts throws when they are missing, which is deliberate: it is how
 * the app refuses to start half-configured. Tests still need it to load, and
 * this is the earliest place to satisfy that -- `setupFiles` runs before the
 * test framework and before any module under test.
 *
 * The values are fake and never reach a network: every suite that touches
 * Supabase mocks src/services/supabase.
 */
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
