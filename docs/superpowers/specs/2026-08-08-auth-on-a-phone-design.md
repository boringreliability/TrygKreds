# Ward 6.3 — auth that works on a phone

**Date:** 2026-08-08
**Status:** approved, not yet implemented

## Why

The first device verification got as far as creating an account. Two defects
sit between that and a working app, and both are invisible to the test suite
because every auth test mocks `supabase.auth`.

**The confirmation link goes nowhere.** `signUp()` in `src/domain/auth.ts` sends
no `emailRedirectTo`, so Supabase falls back to the project's Site URL, still the
default `http://localhost:3000`. The app declares `scheme: "trygkreds"` in
`app.json` but has no deep-link handling of any kind — no `Linking`, no
`getInitialURL`, nothing. A user with only a phone confirms their address, lands
on a dead page, and has no way back into the app.

It only appeared to work during verification because the link happened to be
opened on a machine with a browser.

**The session does not survive the app closing.** `src/services/supabase.ts` sets
`persistSession: true` but passes no `storage` adapter. Read from the installed
client rather than assumed: `@supabase/auth-js/dist/main/GoTrueClient.js:240`
uses `localStorage` when `supportsLocalStorage()`, and falls to
`memoryLocalStorageAdapter` otherwise. React Native has no `localStorage`, so the
session lives in memory and is gone on restart.

Log in, close the app, open it again: back at the login screen. Every user,
every time.

The two are one problem from the user's side. Fixing the link without the storage
gives someone who confirms their address, lands in the app, closes it, and is
back where they started.

## Decisions

| Question                | Decision                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------- |
| Scope                   | Both defects in one ward — separately, either fix still leaves auth broken in practice |
| Where the session lives | `expo-secure-store`, encrypted by the iOS Keychain and Android Keystore                |
| Auth flow               | PKCE                                                                                   |
| Order                   | Storage first, then the deep link                                                      |

### Why the session is encrypted rather than merely stored

`@react-native-async-storage/async-storage` is what Supabase and Expo document,
and it has no size limit and no chunking to get wrong. It is also unencrypted:
protected by the device's own disk encryption while the phone is locked, and by
nothing else.

A stored TrygKreds session is a key to seeing where someone's family is. That is
worth the extra engineering. `expo-secure-store` reaches the Keychain and
Keystore, which protects it from other apps and from a rooted device — not only
from a locked screen.

The cost is real and is accepted: Expo documents a limit around 2048 bytes per
value on iOS, and a Supabase session can exceed it, so the adapter has to split a
value across several entries and reassemble it.

### Why the order is forced, not preferred

PKCE is the right flow for mobile. The implicit flow puts `access_token` and
`refresh_token` in the URL fragment, where they can reach browser history and
logs; PKCE sends a single-use `code` that the app exchanges for a session.

But PKCE stores a **code verifier** when the link is sent and reads it back when
the user returns. Between those two moments the user opens their mail app, so
TrygKreds goes to the background and may be killed. Without persistent storage
the verifier is gone and the exchange fails.

PKCE therefore cannot work until the storage adapter exists. Building the deep
link first would mean either choosing the implicit flow and changing it later, or
building something that cannot be tested. Both are wasted work.

## What changes

### `src/services/sessionStorage.ts` (new)

An adapter satisfying Supabase's `storage` contract — `getItem`, `setItem`,
`removeItem` — over `expo-secure-store`. It splits values below the iOS limit and
reassembles them, keeping a small index so it knows how many parts belong to a
key. It lives in `services/` because that is the only layer allowed to import
Expo.

The splitting and joining are extracted as pure functions so they can be tested
exhaustively without touching a device.

### `src/services/supabase.ts` (modified)

Gains `storage: sessionStorage` and `flowType: 'pkce'`.
`detectSessionInUrl: false` stays — on native there is no URL to detect one in.

### `src/domain/authRedirect.ts` (new)

Zero imports, in the shape of `src/domain/backgroundLocation.ts`. One pure
function takes the URL string from an incoming link and returns either the
`code` to exchange, or a described failure. Every decision lives here; no Expo,
no Supabase.

### `src/services/authLink.ts` (new)

The Expo-facing half: builds the redirect URI from `expo-linking`, listens for
incoming links, hands the URL to `authRedirect`, and calls
`exchangeCodeForSession` on success.

Nothing in `src/hooks/useAuth.tsx` changes. `AuthProvider` already subscribes to
`onAuthStateChange`, so a successful exchange raises `SIGNED_IN` and the session
arrives on its own.

### `src/domain/auth.ts` (modified)

`signUp()` gains a third parameter carrying the redirect URL, and passes it to
Supabase as `emailRedirectTo`. It is supplied by the caller rather than read from
`expo-linking` inside the domain layer, which keeps that layer free of Expo
imports as the architecture requires.

### `src/screens/LoginScreen.tsx` (modified)

The only caller of `signUp()` — it handles both signing in and signing up. It
imports the redirect URI from `src/services/authLink.ts` and passes it through.
This is the seam where the Expo-facing half meets the domain half, and it is the
one place that knows about both.

### Dependencies

`expo-secure-store` is new and needs an allowlist entry in
`scripts/check-dependencies.js` with a reason and its network behaviour, which is
`none`.

`expo-linking` is already allowlisted, but as a peer of expo-router. It is now
used directly, so its reason must say so.

### In the Supabase dashboard

Site URL and the redirect allowlist must be set to the app's scheme. There is no
MCP tool for auth configuration, so this is a manual step and the plan says so
plainly rather than leaving it to be discovered.

## Verification

### What the suite can prove

**The redirect parser, exhaustively.** It is a pure function over a string, so
every case is cheap: a valid `code`, a missing one, a malformed URL — and the
error form.

That last one is not hypothetical. During the first device verification the
confirmation link landed on
`#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`,
because the single-use token had already been consumed. A parser that only looks
for `code` reads that as "no code" and does nothing, leaving the user with an app
that does not react.

Recognising the failure form is therefore a requirement, not a nicety. It is the
same rule already written in `.claude/CLAUDE.md` — _never report a privacy
failure as success_ — in a different disguise: a failed confirmation that turns
into silence is the same defect.

**The chunking, as a round trip.** Split then join must return the original, over
a range of sizes: below the limit, exactly on it, just over, and far over.

**`signUp()`**, against the existing Supabase mock: it must send
`emailRedirectTo`, and it must send the right one.

### What only hardware can prove

Whether the link actually opens the app depends on `scheme` in the manifest, on
the Android intent filters generated by `expo prebuild`, and on the dashboard's
redirect allowlist matching. None of the three exists in JavaScript.

This ward is therefore **not complete until it has been walked through on the
phone**: create an account, receive the mail, tap the link, and land inside the
app signed in — then close the app completely, reopen it, and still be signed in.
That last step is what proves the storage half.

This is the first ward in the project whose acceptance can only be settled on
hardware. It is stated here as part of the definition of done rather than
recorded afterwards as something not yet verified.

## Out of scope

Password reset uses the same deep-link machinery and would be a small addition
once this exists, but it is not part of getting sign-up to work and is not built
here.

Leaked password protection is disabled on the Supabase project. It is a dashboard
setting, unrelated to this work, and is noted only so it is not forgotten.
