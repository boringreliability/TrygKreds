import { readConfig } from './env';

/**
 * readConfig takes a plain object rather than reading process.env itself, so
 * these are ordinary function tests: nothing global to mutate, nothing to
 * restore afterwards, and the same answer on every machine.
 */
describe('readConfig', () => {
  const valid = {
    EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefghijkl.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'a-real-looking-anon-key',
  };

  it('should return the configured values', () => {
    expect(readConfig(valid)).toMatchObject({
      supabaseUrl: 'https://abcdefghijkl.supabase.co',
      supabaseAnonKey: 'a-real-looking-anon-key',
    });
  });

  it('should fail when the URL is missing, and name it', () => {
    expect(() =>
      readConfig({ ...valid, EXPO_PUBLIC_SUPABASE_URL: undefined })
    ).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
  });

  it('should fail when the anon key is missing, and name it', () => {
    expect(() =>
      readConfig({ ...valid, EXPO_PUBLIC_SUPABASE_ANON_KEY: undefined })
    ).toThrow(/EXPO_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it('should say where to get the value', () => {
    expect(() => readConfig({})).toThrow(/Supabase project settings/);
  });

  it('should treat whitespace as missing', () => {
    expect(() =>
      readConfig({ ...valid, EXPO_PUBLIC_SUPABASE_ANON_KEY: '   ' })
    ).toThrow(/EXPO_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it('should reject the old placeholder URL', () => {
    expect(() =>
      readConfig({
        ...valid,
        EXPO_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      })
    ).toThrow(/placeholder/);
  });

  it('should reject the old placeholder anon key', () => {
    expect(() =>
      readConfig({
        ...valid,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key',
      })
    ).toThrow(/placeholder/);
  });

  it('should reject a URL without a scheme', () => {
    expect(() =>
      readConfig({
        ...valid,
        EXPO_PUBLIC_SUPABASE_URL: 'abcdefghijkl.supabase.co',
      })
    ).toThrow(/https:\/\/<project-ref>\.supabase\.co/);
  });

  it('should fail rather than return a default when nothing is set', () => {
    expect(() => readConfig({})).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
  });
});
