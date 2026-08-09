/**
 * The client is constructed once at module load, so this asserts on the
 * arguments rather than on behaviour. Both of these are load-bearing and
 * invisible everywhere else: without `storage` the session does not survive the
 * app closing, and without PKCE the tokens travel in a URL fragment.
 */

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: {} })),
}));

import { createClient } from '@supabase/supabase-js';
import { sessionStorage } from './sessionStorage';
// Imported for its side effect: constructing the client is what we are
// asserting on. Deliberately NOT combined with jest.resetModules() -- resetting
// would hand ./supabase a fresh copy of ./sessionStorage, and the identity
// check below would then compare two different module instances and fail for a
// reason that has nothing to do with the code.
import './supabase';

const options = (createClient as jest.Mock).mock.calls[0][2];

describe('the Supabase client', () => {
  it('should be given somewhere durable to keep the session', () => {
    expect(options.auth.storage).toBe(sessionStorage);
    expect(options.auth.persistSession).toBe(true);
  });

  it('should use the PKCE flow', () => {
    expect(options.auth.flowType).toBe('pkce');
  });

  it('should not look for a session in a URL', () => {
    // There is no URL to find one in on native, and leaving it on would make
    // the client try.
    expect(options.auth.detectSessionInUrl).toBe(false);
  });
});
