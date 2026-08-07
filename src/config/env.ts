/**
 * Environment configuration.
 *
 * Values come from EXPO_PUBLIC_* variables, which Expo inlines into the bundle
 * at build time. They are public by design: the anon key is meant to ship, and
 * row level security is what actually protects the data.
 *
 * Missing configuration is a hard failure. This file used to fall back to a
 * placeholder URL and write a console warning, which meant the app started
 * cleanly on a device while nothing worked -- the failure looked like broken
 * background location, or a permissions problem, or anything except what it was.
 */

export type AppConfig = {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly appName: string;
  readonly appVersion: string;
};

/**
 * The values the old fallback used. Rejected explicitly so a copied .env cannot
 * quietly revive the behaviour this file exists to remove.
 */
const PLACEHOLDERS = [
  'https://placeholder.supabase.co',
  'placeholder-anon-key',
];

/**
 * A deliberately simple check rather than `new URL()`. React Native's URL
 * implementation has historically been incomplete, and this function is meant to
 * behave like arithmetic: the same answer everywhere, with no platform behind it.
 */
const LOOKS_LIKE_A_URL = /^https?:\/\/[^\s/]+/;

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim() ?? '';

  if (trimmed === '') {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and fill in the values from your Supabase project settings.`
    );
  }

  if (PLACEHOLDERS.includes(trimmed)) {
    throw new Error(
      `${name} is still the placeholder value. Replace it with the real value from your Supabase project settings.`
    );
  }

  return trimmed;
}

export function readConfig(env: {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
}): AppConfig {
  const supabaseUrl = required(
    env.EXPO_PUBLIC_SUPABASE_URL,
    'EXPO_PUBLIC_SUPABASE_URL'
  );
  const supabaseAnonKey = required(
    env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    'EXPO_PUBLIC_SUPABASE_ANON_KEY'
  );

  if (!LOOKS_LIKE_A_URL.test(supabaseUrl)) {
    throw new Error(
      `EXPO_PUBLIC_SUPABASE_URL is not a URL: "${supabaseUrl}". It should look like https://<project-ref>.supabase.co.`
    );
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
    appName: 'TrygKreds',
    appVersion: '1.0.0',
  };
}

export const config: AppConfig = readConfig({
  // Referenced statically on purpose. Expo replaces `process.env.EXPO_PUBLIC_X`
  // textually at build time, so a dynamic lookup such as process.env[name] would
  // be undefined in a real bundle while working fine under Jest.
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});
