# TrygKreds — working notes

An open-source, privacy-friendly alternative to Life360, built **BDD + test-first**
as a showcase of the GS-TDD method.

Read [PRIVACY.md](../PRIVACY.md) before changing anything that touches data. It is
not marketing — it names the test or script that enforces each guarantee, and
several of those guarantees are load-bearing in the schema.

---

## 1. Status

Ward 0–6 are built, including four preparatory wards (3.1–3.4) that were not in
the original plan. Feature files for every ward live in `/specs`.

| Ward | What it delivered                                                    |
| ---- | -------------------------------------------------------------------- |
| 0    | Skeleton, Jest, ESLint, CI                                           |
| 1    | Supabase auth, app shell                                             |
| 2    | Groups: create, join by invite code                                  |
| 3    | Manual location sharing, group map                                   |
| 3.1  | Toolchain upgrade to Expo SDK 57 / RN 0.86 / React 19                |
| 3.2  | RLS hardening: recursion, `security_invoker`, invite expiry/rotation |
| 3.3  | `profiles` and display names                                         |
| 3.4  | `PRIVACY.md` + CI privacy guards                                     |
| 4    | Background location updates                                          |
| 5    | SOS with push notifications                                          |
| 6    | Privacy controls: who can see me, pause                              |

Current shape: **335 Jest tests**, **95 RLS assertions** against a real
PostgreSQL, two CI guards that fail the build.

### Not yet verified

- **Nothing has run on a real phone.** Background location, push delivery, map
  tiles and permission dialogs are tested against mocks and a real Postgres — not
  against iOS or Android. This is the next real verification step.
- **The Edge Function is reviewed, not unit-tested.** It is Deno; Jest cannot run
  it. Only its privacy-relevant properties are enforced, by reading its source.
- Two `expo-doctor` checks (config schema, React Native Directory) need network
  access that was unavailable while building, and should be run before release.

---

## 2. Scope

Keep it tight: **groups, location sharing, SOS, privacy controls.** Nothing more.

Deliberately out of scope, and it should stay that way: geofencing, driving
scores, battery statistics, timelines or history of any kind, in-app chat, ads,
subscriptions, upsells.

"No history" is not just a scope decision — see the invariants below.

---

## 3. Invariants

These are the things that look like ordinary code but are not. Breaking one turns
TrygKreds into the product it exists to avoid. Each has a test; if you change the
behaviour, the test and PRIVACY.md change in the same pull request.

### One position per user per group

`member_locations` carries `UNIQUE(user_id, group_id)` and **every write is an
upsert against it**. Replacing an upsert with an insert, or dropping that
constraint, silently creates a location history.
Enforced by `supabase/tests/04_no_history_test.sql`.

### Turning sharing off deletes the position

`disableLocationSharing()` performs the deletion itself, so no caller can turn
sharing off and leave a position behind. Do not move this into a screen — it lived
there once, and it only worked because one call site remembered.
Enforced by `src/domain/location.test.ts`.

### RLS policies must not query the table they protect

The Ward 2 policies did, and Postgres aborted every read path with `42P17`. Use
the `SECURITY DEFINER` helpers instead:

- `public.is_group_member(group_id)` — "am I in this group?"
- `public.shares_group_with(user_id)` — "do I share any group with this person?"

Both resolve `auth.uid()` internally, so a caller can only ever ask about
themselves. Add new helpers the same way rather than inlining subqueries.

### Views need `security_invoker`

A view without it runs with the owner's rights and ignores every policy
underneath. Both existing views set it. **Requires PostgreSQL 15+.**
Enforced by `supabase/tests/02_rls_test.sql`.

### Some things cannot be a policy at all

RLS cannot express "readable only by someone who already knows the secret" — a
`USING` clause cannot see the client's `WHERE`, so any policy permissive enough
would expose every row. Invite redemption and push-token registration therefore
go through `SECURITY DEFINER` functions, and the tables stay closed.

Related: PostgreSQL needs the `SELECT` privilege to evaluate
`ON CONFLICT DO UPDATE` and the `WHERE` of an `UPDATE`/`DELETE`. A table a client
cannot read is a table a client cannot usefully write to either — which is why
`push_tokens` is fully sealed and only functions touch it.

### The app talks only to your Supabase instance

Enforced by `scripts/check-network-access.js`. Two disclosed exceptions, both in
PRIVACY.md: map tiles (Apple/Google, via `react-native-maps`) and push delivery
(`exp.host`, from the Edge Function).

### SOS notifications carry no coordinates

A notification passes through Expo, Apple and Google. Recipients open the app and
read the position from the database, where RLS still applies.
Enforced by a source-reading test in `src/domain/sos.test.ts`.

### A privacy control never turns sharing ON by inference

There is no "resume everything" action, deliberately. Restoring a remembered set
of groups could re-enable a group the user had turned off on purpose. Resuming is
always explicit and per-group.
Enforced by `src/screens/PrivacyScreen.test.tsx`.

### Never report a privacy failure as success

Two specific cases, both tested: a partial "stop sharing with everyone" reports
failure, and a failed read never falls back to showing "nobody can see you".
Saying either when untrue is worse than an error message.

### Never show a raw user id

Use `formatMemberName()` / `memberInitial()`. An unnamed member gets a neutral
placeholder, never a fragment of a UUID.

---

## 4. Architecture

Three layers, and the boundaries are enforced:

```
src/domain/backgroundLocation.ts   No imports at all. Pure decisions.
src/domain/*.ts                    Supabase only. No expo-*, no react-native.
src/services/*.ts                  The only place Expo lives.
```

`src/domain/backgroundLocation.ts` has **zero imports**, and a test reads the file
to keep it that way. Decision logic belongs there so it can be tested as
arithmetic rather than through a device.

Rules that span a database change _and_ a platform effect go in
`src/services/sharingControl.ts` — for example "stop the background task only when
nothing is shared anywhere". That rule was about to live in two screens; keeping
it in one place is why it is there.

---

## 5. Tech stack

- **Node 22+.** A hard requirement, not a preference: `@supabase/supabase-js`
  declares `engines >=22.0.0` and needs the global `WebSocket` that Node gained in 22. On Node 20 the client throws while being constructed, and because that
  happens at module load, every test suite importing it fails before a single test
  runs. CI pins 22 and `package.json` declares it.
- **Expo SDK 57**, React Native 0.86, React 19, TypeScript 6, expo-router
- **Supabase**: Postgres, Auth, Edge Functions
- **Maps**: `react-native-maps`
- **Background**: `expo-location` + `expo-task-manager`
- **Push**: `expo-notifications` + the `send-sos-notification` Edge Function
- **Tests**: Jest + React Native Testing Library **v13** (v14 makes `render()`
  async, which would mean rewriting every screen test)

Versions come from the SDK's own `bundledNativeModules.json` — never hardcode one
from memory. Use `npx expo install --check` and `npx expo-doctor`.

Adding a runtime dependency means adding it to the allowlist in
`scripts/check-dependencies.js`, with a reason and its network behaviour. The
build fails otherwise. That friction is the point, and there is no exception
category — peer requirements are listed explicitly like everything else.

---

## 6. Repository structure

```text
.
├─ app/                      # expo-router routes
├─ src/
│  ├─ components/            # SosButton
│  ├─ screens/
│  ├─ services/              # Expo-facing: location, background, notifications,
│  │                         # sharingControl
│  ├─ hooks/                 # useAuth
│  ├─ domain/                # Core logic (groups, location, profiles, sos,
│  │                         # privacy, backgroundLocation*)
│  └─ config/
├─ specs/                    # BDD feature files, one per ward
├─ supabase/
│  ├─ migrations/            # Schema + RLS policies
│  ├─ tests/                 # RLS suite (runs against real PostgreSQL)
│  └─ functions/             # Edge Functions (Deno)
├─ scripts/                  # test-rls.sh, check-dependencies.js,
│                            # check-network-access.js
├─ tests/mocks/              # Module mocks wired via jest.config.js
└─ PRIVACY.md                # The privacy contract
```

---

## 7. How to work here

Unchanged method: feature file → tests → implementation → refactor while green.

1. **Start with the feature file** in `/specs`. Show the Gherkin first.
2. **Write the tests next**, and show them before implementing.
3. **Run them and confirm they fail** for the expected reason. A test that has
   never been red has not been tested.
4. **Implement** the minimum that passes.
5. **Conventional commits**: `feat(scope):`, `fix(security):`, `chore:`, `docs:`.

### Database work is different

`npm test` mocks Supabase entirely — it would pass against a database with row
level security switched off. Anything touching policies, grants or constraints
must be asserted in `supabase/tests/` and run with `npm run test:rls`.

Verify the guard too, not only the code: break the thing on purpose and confirm
the suite names the broken guarantee. Several defects here were found exactly
that way.

### Commands

```bash
npm test              # Jest
npm run test:rls      # RLS suite against a real PostgreSQL (needs PG 15+)
npm run check:privacy # Dependency allowlist + network access guards
npm run lint
npm run typecheck
```

### When something is unclear

Ask before building — especially anything touching RLS, where a wrong guess
produces a data leak rather than an error message.

### One ward per pull request.

---

## 8. Quality checklist

Before considering a ward complete:

- [ ] Feature file exists under `/specs`
- [ ] Every scenario has a corresponding test
- [ ] Tests were seen failing before they passed
- [ ] `npm test` green
- [ ] `npm run test:rls` green, if the ward touched the database
- [ ] `npm run check:privacy` green
- [ ] `npm run lint` (0 errors) and `npm run typecheck` green
- [ ] `npm ci` still resolves — regenerate the lockfile when dependencies change
- [ ] Code is typed; no `any` without a justification in a comment
- [ ] No `console.log` in production code
- [ ] PRIVACY.md updated if what is stored, who can read it, or how long it is
      kept has changed
- [ ] README updated if a new command or setup step exists
