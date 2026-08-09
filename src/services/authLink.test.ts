jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'trygkreds://auth'),
  getInitialURL: jest.fn(async () => null),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('./supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: jest.fn(),
    },
  },
}));

import * as Linking from 'expo-linking';
import { supabase } from './supabase';
import {
  authRedirectUri,
  handleAuthUrl,
  subscribeToAuthLinks,
} from './authLink';

const exchange = supabase.auth.exchangeCodeForSession as jest.Mock;

beforeEach(() => {
  // Not jest.clearAllMocks(): that would also wipe the call Linking.createURL
  // made while this file's top-level import evaluated authLink.ts, before any
  // beforeEach runs -- and authRedirectUri's own test below depends on that
  // call still being on the record.
  exchange.mockClear();
  (Linking.getInitialURL as jest.Mock).mockClear();
  (Linking.addEventListener as jest.Mock).mockClear();
});

describe('authRedirectUri', () => {
  it('should be built from the app scheme rather than hardcoded', () => {
    expect(Linking.createURL).toHaveBeenCalled();
    expect(authRedirectUri).toBe('trygkreds://auth');
  });
});

describe('handleAuthUrl', () => {
  it('should exchange a code and report a session', async () => {
    exchange.mockResolvedValue({ data: { session: {} }, error: null });

    const outcome = await handleAuthUrl('trygkreds://auth?code=abc123');

    expect(exchange).toHaveBeenCalledWith('abc123');
    expect(outcome).toEqual({ kind: 'signed-in' });
  });

  it('should report the failure a used link describes', async () => {
    const outcome = await handleAuthUrl(
      'trygkreds://auth#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    );

    expect(exchange).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      kind: 'failure',
      message: 'Email link is invalid or has expired',
    });
  });

  it('should report a failure when the exchange itself is refused', async () => {
    // The link looked fine and the server disagreed. Reporting success here
    // would leave someone believing they are signed in when they are not.
    exchange.mockResolvedValue({
      data: { session: null },
      error: { message: 'code challenge does not match' },
    });

    const outcome = await handleAuthUrl('trygkreds://auth?code=abc123');

    expect(outcome.kind).toBe('failure');
  });

  it('should report a failure when the exchange returns no session', async () => {
    exchange.mockResolvedValue({ data: { session: null }, error: null });

    const outcome = await handleAuthUrl('trygkreds://auth?code=abc123');

    expect(outcome.kind).toBe('failure');
  });

  it('should leave an unrelated link alone', async () => {
    const outcome = await handleAuthUrl('trygkreds://groups/123');

    expect(exchange).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: 'unrelated' });
  });
});

describe('subscribeToAuthLinks', () => {
  it('should handle a link that started the app', async () => {
    (Linking.getInitialURL as jest.Mock).mockResolvedValue(
      'trygkreds://auth?code=cold-start'
    );
    exchange.mockResolvedValue({ data: { session: {} }, error: null });
    const onOutcome = jest.fn();

    subscribeToAuthLinks(onOutcome);
    await new Promise((resolve) => setImmediate(resolve));

    expect(exchange).toHaveBeenCalledWith('cold-start');
    expect(onOutcome).toHaveBeenCalledWith({ kind: 'signed-in' });
  });

  it('should handle a link that arrives while the app is running', async () => {
    exchange.mockResolvedValue({ data: { session: {} }, error: null });
    const onOutcome = jest.fn();

    subscribeToAuthLinks(onOutcome);
    const listener = (Linking.addEventListener as jest.Mock).mock.calls[0][1];
    await listener({ url: 'trygkreds://auth?code=warm' });

    expect(exchange).toHaveBeenCalledWith('warm');
    expect(onOutcome).toHaveBeenCalledWith({ kind: 'signed-in' });
  });

  it('should not report unrelated links to the caller', async () => {
    const onOutcome = jest.fn();

    subscribeToAuthLinks(onOutcome);
    const listener = (Linking.addEventListener as jest.Mock).mock.calls[0][1];
    await listener({ url: 'trygkreds://groups/123' });

    expect(onOutcome).not.toHaveBeenCalled();
  });

  it('should stop listening when unsubscribed', () => {
    const remove = jest.fn();
    (Linking.addEventListener as jest.Mock).mockReturnValue({ remove });

    const unsubscribe = subscribeToAuthLinks(jest.fn());
    unsubscribe();

    expect(remove).toHaveBeenCalled();
  });
});
