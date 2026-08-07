# TrygKreds

A privacy-friendly, open-source alternative to Life360.

Built with **BDD + GS-TDD (test-first)** methodology as a showcase project.

## Features (MVP)

- **Groups ("circles")**: Create and join groups via invite code
- **Location sharing**: Share last known location with group members
- **SOS (panic button)**: Alert all group members in emergencies
- **Privacy controls**: Pause sharing, see who can view your location

## Tech Stack

- **Mobile app**: React Native with Expo, TypeScript
- **State management**: React Query + Zustand
- **Backend**: Supabase (Postgres, Auth, Realtime, Edge Functions)
- **Testing**: Jest + React Native Testing Library
- **Maps**: react-native-maps

## Getting Started

### Prerequisites

- Node.js 20+
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
