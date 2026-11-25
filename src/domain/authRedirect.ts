/**
 * What came back from a confirmation link.
 *
 * This module has NO imports -- not expo, not react-native, not the Supabase
 * client. It is arithmetic over a string, so every shape a link can take is
 * cheap to cover, including the ones that only appear when something has gone
 * wrong. A test in authRedirect.test.ts asserts that this stays true.
 *
 * The I/O around it lives in src/services/authLink.ts.
 */

export type AuthRedirect =
  | { readonly kind: 'code'; readonly code: string }
  | {
      readonly kind: 'failure';
      readonly reason: string;
      readonly message: string;
    }
  | { readonly kind: 'unrelated' };

/**
 * Both halves are read. A PKCE code arrives in the query; Supabase puts errors
 * in the fragment. Nothing guarantees that split holds forever, and reading
 * both costs nothing.
 */
function readParams(url: string): Map<string, string> {
  const params = new Map<string, string>();

  // The fragment starts at the first '#', and the query is what lies between
  // the first '?' and it. Splitting on every occurrence instead would cut a
  // value at a literal '?' -- which a fragment may legally contain, and which
  // a human-readable error_description can easily hold.
  const fragmentStart = url.indexOf('#');
  const beforeFragment =
    fragmentStart === -1 ? url : url.slice(0, fragmentStart);
  const fragment = fragmentStart === -1 ? '' : url.slice(fragmentStart + 1);

  const queryStart = beforeFragment.indexOf('?');
  const query = queryStart === -1 ? '' : beforeFragment.slice(queryStart + 1);

  for (const section of [query, fragment]) {
    if (section.length === 0) continue;

    for (const pair of section.split('&')) {
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;

      const name = pair.slice(0, separator);
      const raw = pair.slice(separator + 1);
      if (raw.length === 0) continue;

      // '+' means a space in a query string; decodeURIComponent does not know
      // that, so the two are applied in this order.
      let value: string;
      try {
        value = decodeURIComponent(raw.replace(/\+/g, ' '));
      } catch {
        // A malformed escape is not worth failing the whole parse over.
        value = raw.replace(/\+/g, ' ');
      }

      if (!params.has(name)) params.set(name, value);
    }
  }

  return params;
}

export function parseAuthRedirect(url: string): AuthRedirect {
  const params = readParams(url);

  // A failure wins over anything else present. If the link says it failed, it
  // failed, and acting on a code beside it would be acting on a lie.
  const error = params.get('error') ?? params.get('error_code');
  if (error !== undefined) {
    const reason = params.get('error_code') ?? error;
    const message =
      params.get('error_description') ??
      'That confirmation link is no longer valid. Ask for a new one.';

    return { kind: 'failure', reason, message };
  }

  const code = params.get('code');
  if (code !== undefined) {
    return { kind: 'code', code };
  }

  return { kind: 'unrelated' };
}
