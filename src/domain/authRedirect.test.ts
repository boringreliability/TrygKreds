import fs from 'fs';
import path from 'path';
import { parseAuthRedirect } from './authRedirect';

describe('parseAuthRedirect', () => {
  it('should find the code in a successful redirect', () => {
    const result = parseAuthRedirect('trygkreds://auth?code=abc123');

    expect(result).toEqual({ kind: 'code', code: 'abc123' });
  });

  it('should find the code when other parameters are present', () => {
    const result = parseAuthRedirect(
      'trygkreds://auth?type=signup&code=abc123&foo=bar'
    );

    expect(result).toEqual({ kind: 'code', code: 'abc123' });
  });

  // The URL a real confirmation produced during the first device verification,
  // because the single-use token had already been consumed. A parser that only
  // looks for `code` reads this as "nothing here" and the app does nothing,
  // leaving someone tapping a link that appears dead.
  it('should recognise a link that has already been used', () => {
    const result = parseAuthRedirect(
      'trygkreds://auth#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    );

    expect(result.kind).toBe('failure');
    if (result.kind !== 'failure') throw new Error('unreachable');
    expect(result.reason).toBe('otp_expired');
    expect(result.message).toBe('Email link is invalid or has expired');
  });

  it('should decode percent-escapes in the message', () => {
    const result = parseAuthRedirect(
      'trygkreds://auth#error=access_denied&error_code=bad&error_description=Something%20went%20wrong'
    );

    expect(result.kind).toBe('failure');
    if (result.kind !== 'failure') throw new Error('unreachable');
    expect(result.message).toBe('Something went wrong');
  });

  it('should keep a question mark inside the message', () => {
    // A fragment may legally contain '?', and an error description is prose.
    const result = parseAuthRedirect(
      'trygkreds://auth#error=access_denied&error_code=x&error_description=What+went+wrong?+Try+again'
    );

    expect(result.kind).toBe('failure');
    if (result.kind !== 'failure') throw new Error('unreachable');
    expect(result.message).toBe('What went wrong? Try again');
  });

  it('should find an error in the query as well as the fragment', () => {
    // Supabase puts errors in the fragment, but the query is where a code
    // arrives, and nothing guarantees an error never appears there.
    const result = parseAuthRedirect(
      'trygkreds://auth?error=access_denied&error_code=otp_expired&error_description=gone'
    );

    expect(result.kind).toBe('failure');
  });

  it('should treat an error as an error even when a code is also present', () => {
    const result = parseAuthRedirect(
      'trygkreds://auth?code=abc123#error=access_denied&error_code=otp_expired&error_description=gone'
    );

    expect(result.kind).toBe('failure');
  });

  it('should fall back to a usable message when the description is absent', () => {
    const result = parseAuthRedirect(
      'trygkreds://auth#error=access_denied&error_code=otp_expired'
    );

    expect(result.kind).toBe('failure');
    if (result.kind !== 'failure') throw new Error('unreachable');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('should ignore a link that carries no auth information', () => {
    expect(parseAuthRedirect('trygkreds://groups/123')).toEqual({
      kind: 'unrelated',
    });
  });

  it('should ignore an empty string', () => {
    expect(parseAuthRedirect('')).toEqual({ kind: 'unrelated' });
  });

  it('should ignore a code parameter with no value', () => {
    expect(parseAuthRedirect('trygkreds://auth?code=')).toEqual({
      kind: 'unrelated',
    });
  });
});

// The value of this module is that it is arithmetic over a string: no Expo, no
// Supabase, no platform. src/domain/backgroundLocation.ts is kept honest the
// same way.
describe('the module itself', () => {
  it('should have no imports', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'authRedirect.ts'),
      'utf8'
    );

    expect(source).not.toMatch(/^\s*import\s/m); // static import
    expect(source).not.toMatch(/\bimport\s*\(/); // dynamic import()
    expect(source).not.toMatch(/\brequire\s*\(/); // CommonJS
  });
});
