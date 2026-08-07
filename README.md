# TrygKreds

A privacy-friendly, open-source alternative to Life360.

Built with **BDD + GS-TDD (test-first)** methodology as a showcase project.

**[Read the privacy contract](PRIVACY.md)** -- what is stored, for how long, who
can read it, and which check enforces each guarantee. It is deliberately
specific, and it lists the limitations too.

## Features (MVP)

- **Groups ("circles")**: Create and join groups via invite code
- **Location sharing**: Share last known location with group members, kept up to
  date in the background while sharing is on
- **SOS (panic button)**: Alert all group members in emergencies
- **Privacy controls**: See exactly who can view your location, pause sharing per
  group or for everyone at once. Pausing deletes the stored position rather than
  hiding it

## Tech Stack

- **Mobile app**: React Native with Expo, TypeScript
- **State management**: React Query + Zustand
- **Backend**: Supabase (Postgres, Auth, Realtime, Edge Functions)
- **Testing**: Jest + React Native Testing Library
- **Maps**: react-native-maps

## Getting Started

### Prerequisites

- Node.js 22+ (`@supabase/supabase-js` requires the global `WebSocket` added in Node 22)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)

### Installation

```bash
# Install dependencies
npm install

# Start the development server
npm start
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

#### Row Level Security tests

`npm test` mocks Supabase, so it cannot see a database policy at all -- it would
pass just as happily against a database with RLS switched off. The privacy
guarantees are therefore asserted separately, against a real PostgreSQL:

```bash
npm run test:rls
```

This applies the real migrations in `supabase/migrations/` to a throwaway
PostgreSQL cluster and checks that a user cannot read the location of someone
they share no group with, that a user who has stopped sharing becomes invisible,
that the views do not bypass the policies, and that invite codes expire, can be
revoked and can be rotated. See `supabase/tests/`.

Requires PostgreSQL 15+ server binaries (`initdb`/`pg_ctl`) -- the views rely on
`security_invoker`. To run against a server you already have instead:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:rls
```

#### Privacy guards

The guarantees in [PRIVACY.md](PRIVACY.md) are enforced mechanically, and fail
the build rather than warn:

```bash
npm run check:privacy
```

- `check:dependencies` -- every runtime dependency must be on an explicit
  allowlist in `scripts/check-dependencies.js`, with a reason and its network
  behaviour. Adding a package means editing that list on purpose, in a diff a
  reviewer can see. Anything that reaches a third party must also be disclosed in
  PRIVACY.md.
- `check:network` -- no `fetch`, `XMLHttpRequest`, `WebSocket` or `sendBeacon` in
  our own source, and no absolute URL outside a very short host allowlist. All
  traffic goes through the Supabase client, configured from
  `EXPO_PUBLIC_SUPABASE_URL`.

#### The SOS notification function

SOS push notifications are sent by a Supabase Edge Function in
`supabase/functions/send-sos-notification/`. It runs with the service role,
because that is the only thing permitted to read `push_tokens` -- end users hold
no privilege on that table at all.

```bash
supabase functions deploy send-sos-notification
```

It needs no secrets beyond the `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
that Supabase injects. Sending also requires an EAS `projectId` in `app.json`
(`extra.eas.projectId`), since Expo will not mint a push token without one --
without it the app skips registration rather than failing.

**Not covered by the Jest suite.** It is Deno code with a different runtime, so
`npm test` cannot execute it. What _is_ enforced mechanically is the
privacy-relevant part: a test in `src/domain/sos.test.ts` reads the function's
source and fails if it ever references coordinates, reads `member_locations`, or
posts to a host other than Expo's push relay. Treat the rest of the function as
reviewed-not-tested.

### Linting & Formatting

```bash
# Run linter
npm run lint

# Fix lint errors
npm run lint:fix

# Check formatting
npm run format:check

# Format code
npm run format
```

### Type Checking

```bash
npm run typecheck
```

## Project Structure

```
.
├─ app/                      # Expo Router app entry
├─ src/
│  ├─ components/            # Reusable UI components
│  ├─ screens/               # Screen components
│  ├─ navigation/            # Navigation configuration
│  ├─ services/              # API clients, location, notifications
│  ├─ hooks/                 # Custom React hooks
│  ├─ domain/                # Core domain logic
│  └─ config/                # App configuration
├─ specs/                    # BDD feature files (Gherkin)
├─ supabase/                 # SQL migrations, policies, seed data
├─ tests/                    # Test utilities and e2e tests
└─ .github/workflows/        # CI/CD configuration
```

## Development Methodology

This project follows **GS-TDD** (Goal-Scenario Test-Driven Development):

1. Define **BDD feature files** (Gherkin) under `/specs`
2. Write **tests before implementation**
3. Implement **minimal code** to pass tests
4. **Refactor** while keeping tests green

Development is done in **wards** (small, vertical slices).

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests first (BDD)
4. Implement the feature
5. Ensure all tests pass
6. Submit a pull request

## License

MIT
