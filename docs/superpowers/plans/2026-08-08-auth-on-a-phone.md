# Ward 6.3 — Auth That Works on a Phone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user with only a phone can create an account, confirm it from the email, land inside the app signed in, and still be signed in after closing and reopening it.

**Architecture:** Session storage first, because PKCE cannot work without it — the code verifier is written when the link is sent and read when the user returns, and in between the app may be killed. Then the PKCE flow, then a pure parser for the incoming URL, then the Expo-facing half that listens for links.

**Tech Stack:** Expo SDK 57, `expo-secure-store` (new), `expo-linking` (already present), `@supabase/supabase-js` 2.112.2, Jest with the module mocks in `tests/mocks/`.

## Global Constraints

- **`src/domain/*.ts` may import Supabase and nothing else** — no `expo-*`, no `react-native`. `src/services/*.ts` is the only place Expo lives. `src/domain/authRedirect.ts` must have **zero imports**, like `src/domain/backgroundLocation.ts`.
- **Adding a runtime dependency means an allowlist entry** in `scripts/check-dependencies.js`, with a reason and its network behaviour, or `npm run check:privacy` fails the build. That friction is deliberate.
- **Never let a failed confirmation become silence.** `.claude/CLAUDE.md` already forbids reporting a privacy failure as success; a confirmation link that fails and produces no visible reaction is the same defect.
- **Module mocks are wired in `jest.config.js` under `moduleNameMapper`**, with the mock itself in `tests/mocks/`. Follow the existing entries for `expo-location`, `expo-notifications` and the rest.
- **Versions come from the SDK**, never from memory: install with `npx expo install expo-secure-store`, not `npm install`.
- **Conventional commits.** Prettier covers `**/*.{ts,tsx,js,jsx,json,md}` — not `.feature`.
- **Gates:** `npm test`, `npm run typecheck`, `npm run lint` (0 errors; 2 pre-existing `no-console` warnings in `CreateGroupScreen.tsx` and `JoinGroupScreen.tsx` are expected), `npm run check:privacy`. Baseline before this ward: 344 tests in 24 suites.
- **`npm run test:rls` is not run.** Nothing here touches the database.
- **PRIVACY.md needs no change.** Nothing new is stored server-side; the session already existed and merely gains somewhere durable and encrypted to live on the device.

---

## File Structure

| File                                     | Responsibility                                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/services/sessionStorage.ts`         | Created. Supabase `storage` adapter over `expo-secure-store`, splitting values that exceed the platform limit. Exports its splitting as a pure function. |
| `src/services/sessionStorage.test.ts`    | Created. Round-trip and boundary tests for the splitting, plus adapter behaviour against the mock.                                                       |
| `tests/mocks/expo-secure-store.ts`       | Created. In-memory stand-in, wired in `jest.config.js`.                                                                                                  |
| `src/services/supabase.ts`               | Modified. Gains `storage` and `flowType: 'pkce'`.                                                                                                        |
| `src/services/supabase.test.ts`          | Created. Asserts the client is constructed with both.                                                                                                    |
| `src/domain/authRedirect.ts`             | Created. Zero imports. Turns an incoming URL into a code, a described failure, or nothing.                                                               |
| `src/domain/authRedirect.test.ts`        | Created. Every shape the parser can meet, including the real `otp_expired` URL.                                                                          |
| `src/services/authLink.ts`               | Created. The Expo half: the redirect URI, the exchange, and the subscription.                                                                            |
| `src/services/authLink.test.ts`          | Created.                                                                                                                                                 |
| `src/domain/auth.ts`                     | Modified. `signUp()` takes and forwards the redirect URL.                                                                                                |
| `src/screens/LoginScreen.tsx`            | Modified. Passes it.                                                                                                                                     |
| `app/_layout.tsx`                        | Modified. Subscribes, and shows a failure rather than swallowing it.                                                                                     |
| `scripts/check-dependencies.js`          | Modified. Adds `expo-secure-store`; corrects the reason on `expo-linking`.                                                                               |
| `specs/ward-6-3-auth-on-a-phone.feature` | Created.                                                                                                                                                 |

---

## Task 1: Somewhere durable and encrypted for the session

**Files:**

- Create: `specs/ward-6-3-auth-on-a-phone.feature`
- Create: `tests/mocks/expo-secure-store.ts`
- Create: `src/services/sessionStorage.ts`
- Create: `src/services/sessionStorage.test.ts`
- Modify: `jest.config.js`
- Modify: `scripts/check-dependencies.js`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `export const CHUNK_SIZE: number`
  - `export function splitIntoChunks(value: string, size: number): string[]`
  - `export const sessionStorage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }` — Task 2 passes this object to `createClient`.

- [ ] **Step 1: Install the dependency the Expo way**

```bash
npx expo install expo-secure-store
```

Using `npm install` would pick a version that does not match the SDK. `npx expo install` reads the SDK's own `bundledNativeModules.json`.

- [ ] **Step 2: Confirm the dependency guard fails**

```bash
npm run check:dependencies
```

Expected: FAIL, with `"expo-secure-store" is not on the runtime dependency allowlist.`

That failure is the guard working. It is also the moment the addition becomes a deliberate, reviewable decision rather than a silent one.

- [ ] **Step 3: Add it to the allowlist, and fix the neighbour**

In `scripts/check-dependencies.js`, add to `ALLOWED_RUNTIME_DEPENDENCIES`, keeping the file's alphabetical-ish grouping with the other `expo-` entries:

```js
  'expo-secure-store': {
    reason:
      'Where the Supabase session lives. The iOS Keychain and Android Keystore, so a stored session -- which is a key to seeing where someone\'s family is -- is protected from other apps and from a rooted device, not only by the lock screen.',
    network: 'none',
  },
```

And correct the existing `expo-linking` entry, which now understates what it is for:

```js
  'expo-linking': {
    reason:
      'Deep links. Required peer of expo-router, and used directly to build the auth redirect URI and receive the confirmation link.',
    network: 'none',
  },
```

- [ ] **Step 4: Confirm the guard passes again**

```bash
npm run check:privacy
```

Expected: `Dependency check passed: 21 runtime dependencies, all allowlisted.`

- [ ] **Step 5: Write the feature file**

Create `specs/ward-6-3-auth-on-a-phone.feature`:

```gherkin
Feature: Auth works on a phone
  In order to use TrygKreds without a computer
  As someone who has just installed it
  I want to confirm my address from the email and stay signed in afterwards

  # Two defects, one symptom. signUp() sent no emailRedirectTo, so the
  # confirmation link went to the project's default Site URL and never came
  # back to the app; and the Supabase client had persistSession set but no
  # storage adapter, so on React Native -- which has no localStorage -- the
  # session lived in memory and vanished when the app closed.
  #
  # Verified by: src/services/sessionStorage.test.ts,
  # src/domain/authRedirect.test.ts, src/services/authLink.test.ts,
  # src/domain/auth.test.ts -- and, for what none of them can reach, by
  # walking it through on a device.

  Scenario: The session outlives the app
    Given I have signed in
    When I close the app completely and open it again
    Then I should still be signed in

  Scenario: The session is stored encrypted
    # A stored session is a key to seeing where someone's family is.
    Given a session is written to the device
    Then it should go to the Keychain or Keystore, not to a plain file

  Scenario: A session larger than the platform limit still round-trips
    # Expo documents a limit around 2048 bytes per value on iOS, and a
    # Supabase session can exceed it.
    Given a session larger than one storage entry can hold
    When it is written and read back
    Then it should come back identical

  Scenario: A half-written session is refused rather than half-restored
    Given a stored session is missing one of its parts
    When it is read back
    Then nothing should be returned, and the remains should be cleared

  Scenario: The confirmation link comes back to the app
    Given I sign up on my phone
    Then the confirmation mail should point at the app, not at a web page

  Scenario: Following the link signs me in
    Given I have tapped the confirmation link
    When the app receives it
    Then it should exchange the code and I should be signed in

  Scenario: A link that has already been used says so
    # A confirmation token is single-use. Opening the link twice -- or a mail
    # scanner prefetching it -- produces an error rather than a code, and the
    # app must react visibly. Silence would leave someone tapping a link that
    # appears to do nothing.
    Given the confirmation link has already been used
    When the app receives it
    Then it should tell me the link is no longer valid

  Scenario: An unrelated deep link is left alone
    Given the app receives a link that carries no auth information
    Then it should do nothing
```

- [ ] **Step 6: Write the mock**

Create `tests/mocks/expo-secure-store.ts`:

```ts
/**
 * In-memory stand-in for expo-secure-store.
 *
 * The real module reaches the iOS Keychain and Android Keystore, neither of
 * which exists under Jest. What the tests need from it is only that a value
 * written under a key comes back under that key, so this is a Map.
 */

const store = new Map<string, string>();

export async function getItemAsync(key: string): Promise<string | null> {
  return store.has(key) ? (store.get(key) as string) : null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}

/** Test-only: forget everything between cases. Not part of the real module. */
export function __reset(): void {
  store.clear();
}
```

- [ ] **Step 7: Wire the mock into Jest**

In `jest.config.js`, add to `moduleNameMapper`, after the `expo-constants` line:

```js
    '^expo-secure-store$': '<rootDir>/tests/mocks/expo-secure-store.ts',
```

- [ ] **Step 8: Write the failing tests**

Create `src/services/sessionStorage.test.ts`:

```ts
import * as SecureStore from 'expo-secure-store';
import { CHUNK_SIZE, splitIntoChunks, sessionStorage } from './sessionStorage';

// The mock exposes __reset; the real module does not.
const resetStore = (SecureStore as unknown as { __reset: () => void }).__reset;

beforeEach(() => {
  resetStore();
});

describe('splitIntoChunks', () => {
  it('should return one chunk for a value that fits', () => {
    expect(splitIntoChunks('abc', 10)).toEqual(['abc']);
  });

  it('should return one chunk for a value exactly the size of the limit', () => {
    expect(splitIntoChunks('abcde', 5)).toEqual(['abcde']);
  });

  it('should split a value one character over the limit', () => {
    expect(splitIntoChunks('abcdef', 5)).toEqual(['abcde', 'f']);
  });

  it('should split evenly when the length is an exact multiple', () => {
    expect(splitIntoChunks('abcdef', 2)).toEqual(['ab', 'cd', 'ef']);
  });

  it('should represent an empty value as a single empty chunk', () => {
    // So that reading it back returns '' rather than null -- an empty stored
    // value and an absent one are different answers.
    expect(splitIntoChunks('', 10)).toEqual(['']);
  });

  it('should round-trip values around the real limit', () => {
    for (const length of [
      0,
      1,
      CHUNK_SIZE - 1,
      CHUNK_SIZE,
      CHUNK_SIZE + 1,
      CHUNK_SIZE * 3 + 7,
    ]) {
      const value = 'x'.repeat(length);
      expect(splitIntoChunks(value, CHUNK_SIZE).join('')).toBe(value);
    }
  });
});

describe('sessionStorage', () => {
  it('should return null for a key that was never written', async () => {
    expect(await sessionStorage.getItem('sb-auth-token')).toBeNull();
  });

  it('should round-trip a small value', async () => {
    await sessionStorage.setItem('sb-auth-token', '{"a":1}');

    expect(await sessionStorage.getItem('sb-auth-token')).toBe('{"a":1}');
  });

  it('should round-trip a value larger than one entry can hold', async () => {
    const big = 'y'.repeat(CHUNK_SIZE * 2 + 11);

    await sessionStorage.setItem('sb-auth-token', big);

    expect(await sessionStorage.getItem('sb-auth-token')).toBe(big);
  });

  it('should not leave parts of a longer previous value behind', async () => {
    // A five-part session replaced by a one-part session must not read back
    // with the tail of the old one attached.
    await sessionStorage.setItem('sb-auth-token', 'z'.repeat(CHUNK_SIZE * 4));
    await sessionStorage.setItem('sb-auth-token', 'short');

    expect(await sessionStorage.getItem('sb-auth-token')).toBe('short');
  });

  it('should refuse a half-written value rather than return part of it', async () => {
    const big = 'w'.repeat(CHUNK_SIZE * 2);
    await sessionStorage.setItem('sb-auth-token', big);

    // Simulate a write interrupted partway, or storage evicting one entry.
    await SecureStore.deleteItemAsync('sb-auth-token.1');

    expect(await sessionStorage.getItem('sb-auth-token')).toBeNull();
  });

  it('should clear the remains of a half-written value', async () => {
    const big = 'w'.repeat(CHUNK_SIZE * 2);
    await sessionStorage.setItem('sb-auth-token', big);
    await SecureStore.deleteItemAsync('sb-auth-token.1');

    await sessionStorage.getItem('sb-auth-token');

    expect(await SecureStore.getItemAsync('sb-auth-token')).toBeNull();
    expect(await SecureStore.getItemAsync('sb-auth-token.0')).toBeNull();
  });

  it('should remove every part on removeItem', async () => {
    await sessionStorage.setItem('sb-auth-token', 'v'.repeat(CHUNK_SIZE * 3));

    await sessionStorage.removeItem('sb-auth-token');

    expect(await sessionStorage.getItem('sb-auth-token')).toBeNull();
    expect(await SecureStore.getItemAsync('sb-auth-token.0')).toBeNull();
    expect(await SecureStore.getItemAsync('sb-auth-token.2')).toBeNull();
  });
});
```

- [ ] **Step 9: Run them and confirm they fail for the right reason**

```bash
npx jest src/services/sessionStorage.test.ts
```

Expected: FAIL — `Cannot find module './sessionStorage'`.

- [ ] **Step 10: Show the tests and wait for approval**

The project's method requires it. Show the feature file and the tests, and wait for "godkendt" before implementing.

- [ ] **Step 11: Write the implementation**

Create `src/services/sessionStorage.ts`:

```ts
/**
 * Where the Supabase session lives.
 *
 * The client is configured with `persistSession: true`, but on React Native
 * there is no `localStorage`, so without an adapter supabase-js falls back to
 * memory and the session is gone when the app closes. This is that adapter.
 *
 * It writes to expo-secure-store -- the iOS Keychain and the Android Keystore --
 * rather than to a plain file. A stored TrygKreds session is a key to seeing
 * where someone's family is, so it is worth protecting from other apps and from
 * a rooted device, not only from a locked screen.
 *
 * The price is the size limit: Expo documents around 2048 bytes per value on
 * iOS, and a Supabase session can exceed it. So a value is split across several
 * entries -- `<key>.0`, `<key>.1`, ... -- with `<key>` itself holding the count.
 */

import * as SecureStore from 'expo-secure-store';

/**
 * Comfortably below the documented 2048, because the limit is on the stored
 * representation rather than on our string and the margin costs nothing.
 */
export const CHUNK_SIZE = 1800;

/**
 * Pure: no storage, no platform. An empty value becomes a single empty chunk,
 * so that reading it back yields '' rather than null -- a stored empty value
 * and an absent one are different answers.
 */
export function splitIntoChunks(value: string, size: number): string[] {
  if (value.length === 0) return [''];

  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += size) {
    chunks.push(value.slice(i, i + size));
  }
  return chunks;
}

function partKey(key: string, index: number): string {
  return `${key}.${index}`;
}

async function deleteParts(key: string, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await SecureStore.deleteItemAsync(partKey(key, i));
  }
}

async function storedCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(key);
  if (raw === null) return 0;

  const count = Number.parseInt(raw, 10);
  return Number.isInteger(count) && count >= 0 ? count : 0;
}

export const sessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await storedCount(key);
    if (count === 0) return null;

    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(partKey(key, i));

      if (part === null) {
        // A part is missing -- an interrupted write, or storage evicting an
        // entry. Returning what survives would hand supabase-js a truncated
        // session, which is worse than no session: it looks valid and is not.
        // Clear the remains so the next write starts from nothing.
        await deleteParts(key, count);
        await SecureStore.deleteItemAsync(key);
        return null;
      }

      parts.push(part);
    }

    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    // Delete the old parts first. A five-part session replaced by a one-part
    // session would otherwise leave parts 1..4 behind, and the next read of a
    // longer value would splice the survivors into it.
    const previous = await storedCount(key);
    await deleteParts(key, previous);

    const chunks = splitIntoChunks(value, CHUNK_SIZE);
    for (let i = 0; i < chunks.length; i += 1) {
      await SecureStore.setItemAsync(partKey(key, i), chunks[i]);
    }

    // The count goes last, so a write interrupted partway leaves either the old
    // count (whose parts have gone, caught by getItem) or none at all.
    await SecureStore.setItemAsync(key, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    const count = await storedCount(key);
    await deleteParts(key, count);
    await SecureStore.deleteItemAsync(key);
  },
};
```

- [ ] **Step 12: Run the tests and confirm they pass**

```bash
npx jest src/services/sessionStorage.test.ts
```

Expected: 13 passed — 6 for `splitIntoChunks`, 7 for the adapter.

- [ ] **Step 13: Run the gates and commit**

```bash
npm test
npm run typecheck
npm run lint
npm run check:privacy
npx prettier --write src/services/sessionStorage.ts src/services/sessionStorage.test.ts tests/mocks/expo-secure-store.ts jest.config.js scripts/check-dependencies.js
git add specs/ward-6-3-auth-on-a-phone.feature tests/mocks/expo-secure-store.ts src/services/sessionStorage.ts src/services/sessionStorage.test.ts jest.config.js scripts/check-dependencies.js package.json package-lock.json
git commit -m "feat(auth): keep the session in the Keychain instead of in memory

The Supabase client was configured with persistSession: true and no
storage adapter. On React Native there is no localStorage, so supabase-js
falls back to memory -- read from the installed client, GoTrueClient.js:240
-- and the session was gone whenever the app closed. Every user, every
time.

It now goes to expo-secure-store: the iOS Keychain and the Android
Keystore, so a stored session is protected from other apps and from a
rooted device rather than only by the lock screen. A session is a key to
seeing where someone's family is; a plain file is not enough for that.

Expo documents a limit around 2048 bytes per value on iOS and a Supabase
session can exceed it, so a value is split across numbered entries with the
count stored under the key itself. The count is written last, and a read
that finds a part missing clears the remains and returns null -- a
truncated session is worse than none, because it looks valid."
```

The client is not wired to this adapter yet; that is Task 2. Nothing changes for the user until it is.

---

## Task 2: Wire the adapter in, and switch to PKCE

**Files:**

- Modify: `src/services/supabase.ts`
- Create: `src/services/supabase.test.ts`

**Interfaces:**

- Consumes: `sessionStorage` from Task 1.
- Produces: a client that persists and uses PKCE. Task 4 relies on `supabase.auth.exchangeCodeForSession` being available and on the flow being PKCE.

- [ ] **Step 1: Write the failing test**

Create `src/services/supabase.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx jest src/services/supabase.test.ts
```

Expected: FAIL — `expect(received).toBe(expected)` on `options.auth.storage`, which is `undefined`.

- [ ] **Step 3: Implement**

Replace the `createClient` call in `src/services/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env';
import { sessionStorage } from './sessionStorage';

export const supabase = createClient(
  config.supabaseUrl,
  config.supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      // Where the session actually goes. Without this, supabase-js falls back to
      // memory on React Native and the session dies with the app.
      storage: sessionStorage,
      // PKCE rather than the implicit flow: the confirmation link then carries a
      // single-use code instead of the tokens themselves, which would otherwise
      // travel in a URL fragment and can reach logs and browser history.
      flowType: 'pkce',
      // No URL to find a session in on native.
      detectSessionInUrl: false,
    },
  }
);
```

- [ ] **Step 4: Run the test and the full suite**

```bash
npx jest src/services/supabase.test.ts
npm test
```

Expected: 3 passed, then the whole suite green. Watch for suites that import the real client — if any now fail, the mock in this file is leaking; it is scoped to this file and should not.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/services/supabase.ts src/services/supabase.test.ts
git add src/services/supabase.ts src/services/supabase.test.ts
git commit -m "feat(auth): persist the session and switch to PKCE

Two settings, both load-bearing and both invisible anywhere else.

storage points at the adapter from the previous commit, so the session
survives the app closing.

flowType pkce means the confirmation link carries a single-use code rather
than the tokens themselves. Under the implicit flow the access and refresh
tokens travel in the URL fragment, where they can reach browser history and
logs.

PKCE also stores a code verifier when the link is sent and reads it back
when the user returns -- which is why the storage had to come first. In
between those two moments the app goes to the background while the user
opens their mail, and may be killed."
```

---

## Task 3: Understand what came back

**Files:**

- Create: `src/domain/authRedirect.ts`
- Create: `src/domain/authRedirect.test.ts`

**Interfaces:**

- Consumes: nothing. This file has **zero imports**.
- Produces:
  - `export type AuthRedirect = { readonly kind: 'code'; readonly code: string } | { readonly kind: 'failure'; readonly reason: string; readonly message: string } | { readonly kind: 'unrelated' }`
  - `export function parseAuthRedirect(url: string): AuthRedirect` — Task 4 calls this.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/authRedirect.test.ts`:

```ts
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

    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\s*\(/);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

```bash
npx jest src/domain/authRedirect.test.ts
```

Expected: FAIL — `Cannot find module './authRedirect'`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/authRedirect.ts`:

```ts
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

  const afterScheme = url.replace(/^[^?#]*/, '');
  for (const section of afterScheme.split(/[?#]/)) {
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
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npx jest src/domain/authRedirect.test.ts
```

Expected: 11 passed — 10 for the parser, 1 for the no-imports rule.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/domain/authRedirect.ts src/domain/authRedirect.test.ts
git add src/domain/authRedirect.ts src/domain/authRedirect.test.ts
git commit -m "feat(auth): read what a confirmation link came back with

A pure function over the URL, with no imports at all, so every shape a link
can take is cheap to cover -- including the ones that only appear when
something has gone wrong.

The failure case is not hypothetical. During the first device verification
the link landed on error_code=otp_expired, because the single-use token had
already been consumed. A parser that only looks for a code reads that as
nothing at all, and the app does nothing, leaving someone tapping a link
that appears dead. Recognising the failure form is the requirement, not a
nicety.

An error wins over a code found beside it: if the link says it failed, it
failed, and acting on the code would be acting on a lie."
```

---

## Task 4: Receive the link, and never swallow a failure

**Files:**

- Create: `src/services/authLink.ts`
- Create: `src/services/authLink.test.ts`
- Modify: `app/_layout.tsx`

**Interfaces:**

- Consumes: `parseAuthRedirect` from Task 3, `supabase` from Task 2.
- Produces:
  - `export const authRedirectUri: string` — Task 5 passes this to `signUp()`.
  - `export type AuthLinkOutcome = { readonly kind: 'signed-in' } | { readonly kind: 'failure'; readonly message: string } | { readonly kind: 'unrelated' }`
  - `export async function handleAuthUrl(url: string): Promise<AuthLinkOutcome>`
  - `export function subscribeToAuthLinks(onOutcome: (outcome: AuthLinkOutcome) => void): () => void`

- [ ] **Step 1: Write the failing tests**

Create `src/services/authLink.test.ts`:

```ts
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
  jest.clearAllMocks();
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
```

- [ ] **Step 2: Run them and confirm they fail**

```bash
npx jest src/services/authLink.test.ts
```

Expected: FAIL — `Cannot find module './authLink'`.

- [ ] **Step 3: Write the implementation**

Create `src/services/authLink.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npx jest src/services/authLink.test.ts
```

Expected: 10 passed.

- [ ] **Step 5: Wire it into the app**

Replace `app/_layout.tsx` with:

```tsx
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/hooks/useAuth';
import { subscribeToAuthLinks } from '../src/services/authLink';
// Imported for its side effect: defines the background location task handler at
// module load, so a background event delivered into a cold start finds it.
import '../src/services/registerBackgroundTasks';

export default function RootLayout() {
  useEffect(() => {
    // A confirmation link can start the app or arrive while it is running, and
    // either way the session appears through onAuthStateChange without anything
    // here having to route. What this does have to do is show a failure: a link
    // that quietly does nothing is indistinguishable from a broken app.
    return subscribeToAuthLinks((outcome) => {
      if (outcome.kind === 'failure') {
        Alert.alert('Confirmation failed', outcome.message);
      }
    });
  }, []);

  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
```

- [ ] **Step 6: Run the gates and commit**

```bash
npm test
npm run typecheck
npm run lint
npm run check:privacy
npx prettier --write src/services/authLink.ts src/services/authLink.test.ts app/_layout.tsx
git add src/services/authLink.ts src/services/authLink.test.ts app/_layout.tsx
git commit -m "feat(auth): receive the confirmation link and act on it

Listens at both doors -- getInitialURL for a link that starts the app cold,
and the url event for one that arrives while it is running. Missing either
loses half the cases.

Nothing touches useAuth. AuthProvider already subscribes to
onAuthStateChange, so a successful exchange raises SIGNED_IN and the
session arrives on its own.

A failure is shown rather than swallowed. A link that quietly does nothing
is indistinguishable from a broken app, and this repository already forbids
the same shape of defect elsewhere: never report a failure as success. That
includes an exchange that returns neither an error nor a session, which is
not success either."
```

---

## Task 5: Point the link at the app

**Files:**

- Modify: `src/domain/auth.ts`
- Modify: `src/domain/auth.test.ts`
- Modify: `src/screens/LoginScreen.tsx`

**Interfaces:**

- Consumes: `authRedirectUri` from Task 4.
- Produces: `signUp(email: string, password: string, emailRedirectTo: string): Promise<AuthResult>`.

- [ ] **Step 1: Write the failing test**

Add to `src/domain/auth.test.ts`, inside the existing `describe` for `signUp`:

```ts
it('should tell Supabase to send the confirmation link back to the app', async () => {
  // Without this the link goes to the project's Site URL, which is a web page
  // the app cannot receive. Someone with only a phone confirms their address
  // and has no way back in.
  mockSignUp.mockResolvedValue({
    data: { user: { id: 'u1', email: 'a@b.test', created_at: 'now' } },
    error: null,
  });

  await signUp('a@b.test', 'Password1', 'trygkreds://auth');

  expect(mockSignUp).toHaveBeenCalledWith({
    email: 'a@b.test',
    password: 'Password1',
    options: { emailRedirectTo: 'trygkreds://auth' },
  });
});
```

If the existing suite names the Supabase auth mock differently, use that name — read the top of the file rather than assuming `mockSignUp`.

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx jest src/domain/auth.test.ts
```

Expected: FAIL — `signUp` was called without `options`.

- [ ] **Step 3: Implement**

In `src/domain/auth.ts`, change the signature and the call:

```ts
export async function signUp(
  email: string,
  password: string,
  // Supplied by the caller rather than read from expo-linking here: this layer
  // must not import Expo. Without it the confirmation link goes to the
  // project's Site URL, which a phone cannot come back from.
  emailRedirectTo: string
): Promise<AuthResult> {
```

and

```ts
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: { emailRedirectTo },
});
```

- [ ] **Step 4: Pass it from the only caller**

In `src/screens/LoginScreen.tsx`, add the import:

```ts
import { authRedirectUri } from '../services/authLink';
```

and change the call:

```ts
const result = isSignUp
  ? await signUp(email, password, authRedirectUri)
  : await signIn(email, password);
```

- [ ] **Step 5: Run the gates and commit**

```bash
npm test
npm run typecheck
npm run lint
npm run check:privacy
npx prettier --write src/domain/auth.ts src/domain/auth.test.ts src/screens/LoginScreen.tsx
git add src/domain/auth.ts src/domain/auth.test.ts src/screens/LoginScreen.tsx
git commit -m "feat(auth): send the confirmation link back to the app

signUp() now passes emailRedirectTo. Without it Supabase falls back to the
project's Site URL, and someone with only a phone confirms their address on
a page the app cannot receive, with no way back in.

The URL comes from the caller rather than from expo-linking inside the
domain layer, which may not import Expo. LoginScreen is the seam: it is the
only caller of signUp, and the one place that knows about both halves."
```

Expected total after this task: 24 suites, 344 baseline plus the tests added across Tasks 1, 2, 3 and 5.

---

## Task 6: Walk it through on the phone

Nothing here can be settled by the suite. Whether the link opens the app depends on `scheme` in the manifest, on the Android intent filters generated by `expo prebuild`, and on the dashboard's redirect allowlist — none of which exists in JavaScript.

**Files:** none. This task produces a verified flow, or a named defect.

**Interfaces:**

- Consumes: everything from Tasks 1–5.
- Produces: the answer to whether this ward is done.

- [ ] **Step 1: Set the dashboard, which no tool here can reach**

In the Supabase dashboard for project `ywbyfbmllklvmmpstvcu`, under Authentication → URL Configuration:

- Set **Site URL** to `trygkreds://auth`.
- Add `trygkreds://auth` and `trygkreds://*` to **Redirect URLs**.

There is no MCP tool for auth configuration, so this is manual. Nothing later in this task works until it is done.

- [ ] **Step 2: Rebuild, because the manifest changed under you**

```bash
npx expo prebuild --platform android --clean
npx expo run:android
```

`expo-secure-store` is a native module; a JavaScript reload will not pick it up.

- [ ] **Step 3: Confirm the scheme reached the manifest**

```bash
grep -A2 'android:scheme="trygkreds"' android/app/src/main/AndroidManifest.xml
```

Expected: at least one match. If there is none, the link cannot open the app no matter what the dashboard says, and everything below will fail for that reason rather than any other.

- [ ] **Step 4: Sign up with an address you have not used**

The existing account is already confirmed, so it cannot exercise this. Use a fresh address.

- [ ] **Step 5: Open the link from the phone**

Open the mail on the phone and tap the link **once**. It is single-use: a second tap produces `otp_expired`.

Expected: the app opens and you are signed in, landing on the group list rather than the login screen.

- [ ] **Step 6: Prove the failure path is not silent**

Tap the same link a second time.

Expected: the app opens and shows an alert saying the link is invalid or has expired. If nothing happens, the failure is being swallowed — which is the defect this ward exists to prevent, and it means Task 4's wiring is wrong.

- [ ] **Step 7: Prove the session outlives the app**

Swipe the app away from the recent-apps list — properly closed, not backgrounded — and open it again.

Expected: still signed in, straight to the group list. This is what proves the storage half; nothing before this step distinguishes a session in memory from one in the Keychain.

- [ ] **Step 8: Record the result**

Update `.claude/CLAUDE.md`: move what this verified out of "Not yet verified" and into "Verified on hardware", and remove the entry about the auth flow stranding a phone-only user, which this ward closes.

```bash
npx prettier --write .claude/CLAUDE.md
git add .claude/CLAUDE.md
git commit -m "docs(claude): auth now works on a phone

Confirmed on the device: sign up, tap the link once, land in the app signed
in; tap it again and be told it is spent; close the app completely and open
it still signed in.

The last of those is the one that could not be faked -- nothing before it
distinguishes a session held in memory from one in the Keychain."
```

---

## Out of scope

Password reset uses the same machinery and would be a small addition once this exists. It is not part of getting sign-up to work.

Leaked password protection is disabled on the Supabase project. It is a dashboard setting, unrelated to this work, noted so it is not forgotten.
