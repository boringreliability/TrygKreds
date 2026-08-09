/**
 * The Expo-facing half of the confirmation flow.
 *
 * The decisions live in src/domain/authRedirect.ts, which has no imports and
 * can be tested exhaustively. This file is the part that cannot: it builds the
 * redirect URI from the app's scheme, listens for incoming links, and trades a
 * code for a session.
 *
 * Nothing here touches useAuth. AuthProvider already subscribes to
 * onAuthStateChange, so a successful exchange raises SIGNED_IN and the session
 * arrives on its own.
 */

import * as Linking from 'expo-linking';
import { parseAuthRedirect } from '../domain/authRedirect';
import { supabase } from './supabase';

/**
 * Built from the scheme in app.json rather than written out, so the two cannot
 * drift apart. This is what goes to Supabase as emailRedirectTo, and it must
 * also be on the project's redirect allowlist in the dashboard.
 */
export const authRedirectUri = Linking.createURL('auth');

export type AuthLinkOutcome =
  | { readonly kind: 'signed-in' }
  | { readonly kind: 'failure'; readonly message: string }
  | { readonly kind: 'unrelated' };

export async function handleAuthUrl(url: string): Promise<AuthLinkOutcome> {
  const redirect = parseAuthRedirect(url);

  if (redirect.kind === 'unrelated') {
    return { kind: 'unrelated' };
  }

  if (redirect.kind === 'failure') {
    return { kind: 'failure', message: redirect.message };
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(
    redirect.code
  );

  if (error) {
    return { kind: 'failure', message: error.message };
  }

  if (!data?.session) {
    // No error and no session is not success. Saying otherwise would leave
    // someone believing they are signed in when they are not.
    return {
      kind: 'failure',
      message: 'That confirmation link did not sign you in. Ask for a new one.',
    };
  }

  return { kind: 'signed-in' };
}

/**
 * Both doors. A link can start the app cold, in which case it is waiting at
 * getInitialURL, or arrive while it is already running, in which case it comes
 * through the listener. Missing either one loses half the cases.
 *
 * Unrelated links are not reported: the caller would have nothing to do with
 * them, and passing them on invites someone to react to a link that has nothing
 * to do with auth.
 */
export function subscribeToAuthLinks(
  onOutcome: (outcome: AuthLinkOutcome) => void
): () => void {
  let cancelled = false;

  const deliver = async (url: string): Promise<void> => {
    const outcome = await handleAuthUrl(url);
    if (!cancelled && outcome.kind !== 'unrelated') onOutcome(outcome);
  };

  void Linking.getInitialURL().then((url) => {
    if (url) void deliver(url);
  });

  const subscription = Linking.addEventListener('url', ({ url }) =>
    deliver(url)
  );

  return () => {
    cancelled = true;
    subscription.remove();
  };
}
