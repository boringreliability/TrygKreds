# Android device verification — design

**Date:** 2026-08-07
**Status:** approved, not yet implemented

## Why

`.claude/CLAUDE.md` records that nothing in TrygKreds has run on a phone. Background
location, push delivery, map tiles and permission dialogs are tested against mocks
and a real PostgreSQL, never against Android or iOS. This design covers the first
step out of that: getting the app onto a physical Android device and verifying
Ward 1–3 by hand.

## What we found first

Two facts changed the shape of this work, and both were discovered by checking
rather than assuming.

**There is no local Supabase instance.** `supabase/config.toml` does not exist,
the Supabase CLI is not installed, and the two PostgreSQL containers running in
Docker belong to other projects. What the repository has is
`scripts/test-rls.sh`, which creates a throwaway PostgreSQL cluster, applies the
migrations, runs the assertions and deletes the cluster on exit.

That is not a backend the app can use. Supabase is PostgreSQL _plus_ PostgREST,
GoTrue, Realtime and an Edge Function runtime; `@supabase/supabase-js` speaks
HTTP to PostgREST and GoTrue and cannot connect to bare PostgreSQL at all. The
RLS suite reaches the database directly with `psql` and has never needed the API
layer — which is why it can run on a disposable cluster, and why it brings us no
closer to a phone.

**The Android map needs a Google Maps API key.** `GroupMapScreen.tsx` renders
`MapView` without a `provider`, and on Android that means Google Maps — the only
option there. Without `com.google.android.geo.API_KEY` the map renders as a grey
surface. Ward 3's acceptance ("see the position on the map") would fail on a
missing key while looking like a code defect.

## Decisions

| Question           | Decision                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Platform           | Android first — no Apple Developer membership needed, and Android's background-location rules are the stricter of the two |
| Backend            | Supabase cloud, free tier                                                                                                 |
| Build path         | Local build over USB (`npx expo run:android`)                                                                             |
| Scope              | Staged. This piece ends at a Ward 1–3 smoke test                                                                          |
| Missing config     | Becomes a hard failure, built test-first                                                                                  |
| Native directories | `android/` and `ios/` stay out of git                                                                                     |

### Why toolchain before backend

A Gradle failure, an autolinking failure and a wrong Supabase URL all look
identical on the screen: an app that does nothing. Stage 1 deliberately has no
backend, so when it fails there is exactly one candidate explanation. Each later
stage adds one new thing that can be wrong.

### Why `android/` is not committed

`npx expo run:android` runs `expo prebuild`, which generates `android/` from
`app.json`. Committing the generated directory means config plugins quietly stop
taking effect — the checked-in native files win. Keeping it ignored preserves
`app.json` as the single source of truth. PR #4 was spent cleaning up exactly
that file.

### Why no new dependency

An earlier draft added `expo-dev-client`. It is not required: `npx expo
run:android` produces a debug build that connects to Metro on its own, and
`expo-dev-client` only adds the dev-launcher UI on top.

Leaving it out also avoids weakening the allowlist in
`scripts/check-dependencies.js`. Its three network categories — `none`,
`supabase`, `thirdParty` — describe the _shipped_ app, and a tool stripped from
release builds fits none of them honestly. If the launcher turns out to be worth
having, it can be added later as its own decision.

## The four stages

### Stage 1 — the app on the phone, no backend

Add `/android` and `/ios` to `.gitignore`. Run `npx expo prebuild --platform
android`, then `npx expo run:android` with the phone connected over USB.

**Done when:** the app launches on the phone and shows the login screen. It
cannot sign in — it still points at the placeholder URL. That is the expected
state, not a failure.

**Requires from the user:** USB debugging enabled and the phone connected. `adb
devices` is currently empty.

### Stage 2 — Supabase cloud

Create the project. The free tier allows two active projects per organisation and
pauses them after roughly a week of inactivity, so an existing paused project may
need restoring or removing first.

Apply `supabase/migrations/` with `npx supabase`, without installing the CLI
globally. Write `.env` with `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY`; `.gitignore` already covers `.env`.

The `send-sos-notification` Edge Function is **not** deployed here. It belongs to
Ward 5, which is a later stage.

**Done when:** the migrations have been applied and `.env` holds real values.

Note that `EXPO_PUBLIC_*` variables are inlined at build time, not read at
runtime: changing `.env` means restarting Metro, and the anon key ends up
physically inside the app bundle. That is by design — the key is public, and RLS
is what protects the data. It is also why the RLS suite is load-bearing.

### Stage 3 — config validation, test-first

Follows GS-TDD: feature file, then tests, then approval, then implementation.

**Feature file:** `specs/ward-6-1-config-validation.feature`, following the
existing convention for preparatory wards.

**The change.** `src/config/env.ts` currently falls back to
`https://placeholder.supabase.co` and emits a `console.warn`. On a phone that
means the app starts cleanly while nothing works — the same class of quiet
failure that `.claude/CLAUDE.md` forbids under "Never report a privacy failure as
success".

It is replaced by a pure function, `readConfig(env)`, which takes a plain object
and either returns a valid configuration or throws. No `process.env` access
inside, no imports — the same shape as `src/domain/backgroundLocation.ts`, so it
can be tested as arithmetic rather than through the environment. The module then
calls it once with `process.env`.

It rejects three things: an empty value, the placeholder value, and a URL that
does not parse. The error message names the exact variable and what to do about
it, never a generic "config error".

Throwing happens at module load, so the app fails at startup. That is deliberate:
the alternative is an app that starts and then fails diffusely later.

**Test setup.** The current `if (process.env.NODE_ENV !== 'test')` escape hatch is
removed, and the Jest setup sets the two variables to test values instead. This
closes a divergence between test and production — the validation path is
currently the only code in the repository that never executes under test.

**Tests.** Unit tests on `readConfig` for each rejected case and the valid one.

An earlier draft of this design also called for a source-reading test to keep the
placeholder strings from returning, in the style of `src/domain/sos.test.ts`. It
is not needed here and has been dropped. That technique exists because the Edge
Function is Deno and cannot be unit-tested at all, whereas `readConfig` is called
directly: `readConfig({})` throwing _is_ the assertion that no fallback exists. If
anyone reintroduces a default, that test stops failing and goes red on its own.

**Test setup, verified rather than assumed.** The variables are set in a Jest
`setupFiles` entry rather than `setupFilesAfterEnv`, because `setupFiles` runs
before the test framework and before any module under test is required. Whether
that is early enough was checked with a throwaway spike: a value set there is
visible to a module reading `process.env.EXPO_PUBLIC_*`, so Expo's build-time
inlining does not pre-empt it under Jest.

That inlining is still real in a bundle, which is why `env.ts` passes
`readConfig` an object built from static `process.env.EXPO_PUBLIC_X` references.
A dynamic lookup would work under Jest and be `undefined` on the device.

### Stage 4 — smoke test on the device

By hand, on the phone: create an account, sign in, create a group, share a
position manually, see it on the map.

The Google Maps key is needed before the last step. `app.json` stays as it is; an
`app.config.js` beside it layers the key in from the environment, which Expo
supports by passing the `app.json` contents in as `config`:

```js
export default ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY } },
  },
});
```

The key is therefore never committed, which matters in a public repository, while
`app.json` keeps its role as the readable declarative base and the dynamic layer
has exactly one job. The key is restricted by package name and signing
certificate in the Google Cloud console.

## Out of scope

Ward 4 (background location) and Ward 5 (SOS push) are deliberately excluded.
Both need setup this stage does not do — FCM credentials, a deployed Edge
Function, and a second device or account — and both fail in ways worth isolating
from a first run.

iOS is excluded. Verifying push there requires a paid Apple Developer membership.

## Quality gates

`npm test`, `npm run lint`, `npm run typecheck` and `npm run check:privacy` must
be green. `npm run test:rls` is not run: nothing here touches the database.
`check:privacy` is unaffected because no dependency changes. PRIVACY.md needs no
update — map tiles are already a disclosed exception, and nothing new is stored.
