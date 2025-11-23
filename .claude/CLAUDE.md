# Plan for building TrygKreds with BDD + GS-TDD (test-first)

You are an AI pair-programmer helping me build an open-source, privacy-friendly alternative to Life360.

The project is also a **showcase of my GS-TDD method** and should be built **BDD + test-first**, in small vertical slices ("wards").

Your goals:

1. Keep the scope tight: **groups, location sharing, SOS. Nothing more.**
2. Every feature is driven by:

   * BDD-style **feature files (Gherkin)**
   * Automated **tests written before implementation**
3. Code must be clean, readable and documented – this repo is meant as an example for others.

---

## 1. Functional scope (MVP)

Core features:

1. **Groups ("circles")**

   * Create a group (e.g. "Family", "Dad & Son")
   * Join a group via invite code/link
   * View members of a group

2. **Location sharing**

   * User can toggle: "Share my location with this group"
   * App shows **last known location** of each member on a map
   * No full history in v1, just "last seen at HH:MM" and coordinates

3. **SOS (panic button)**

   * Big SOS button in the UI
   * When pressed:

     * Saves an SOS event in backend (who, when, lat/lng)
     * Sends push notification to all members in the group

4. **Privacy controls**

   * User can:

     * See who can see their location
     * Pause location sharing (e.g. until re-enabled or for a fixed time)

Out of scope for v1:

* Geofencing
* Driving scores, battery usage stats, timeline/history
* In-app chat
* Ads, subscriptions, upsells

---

## 2. Tech stack and constraints

Use this stack unless explicitly instructed otherwise:

* **Mobile app**: React Native with Expo, TypeScript
* **State management**: React Query + Context or lightweight store (Zustand) where needed
* **Backend**: Supabase (Postgres, Auth, Realtime, Edge Functions)
* **Testing**:

  * Unit & integration: Jest + React Native Testing Library
  * For API calls: MSW (Mock Service Worker) or equivalent mocking inside Jest
* **Maps**: `react-native-maps` (or Expo's supported equivalent)
* **Push notifications**: Expo Notifications + Supabase function to trigger pushes

Code style:

* TypeScript strict mode
* ESLint + Prettier
* Simple, boring architecture. Small, focused modules.

---

## 3. Repository structure

Create a repo with structure similar to:

```text
.
├─ app/                      # Expo app entry
├─ src/
│  ├─ components/
│  ├─ screens/
│  ├─ navigation/
│  ├─ services/              # API clients, location service, notification service
│  ├─ hooks/
│  ├─ domain/                # Core domain logic (groups, location, sos)
│  └─ config/
├─ specs/                    # BDD feature files (Gherkin)
│  ├─ ward-0-*.feature
│  ├─ ward-1-*.feature
│  └─ ...
├─ supabase/                 # SQL migrations, policies, seed data
├─ tests/
│  ├─ e2e/ (optional later)
│  └─ utils/
├─ package.json
├─ jest.config.ts
└─ README.md
```

---

## 4. GS-TDD "wards" – incremental plan

We build in **wards** (small, vertical slices).
Each ward:

1. Define/extend **feature files** under `/specs`.
2. Create/extend **tests** (Jest + RTL, and domain tests).
3. Implement minimal code to satisfy tests.
4. Refactor while keeping tests green.

### Ward 0 – Skeleton, tooling and health checks

Goal: a clean, testable project skeleton with one trivial passing feature.

**BDD feature (`specs/ward-0-healthcheck.feature`):**

```gherkin
Feature: Project healthcheck
  In order to verify the project is correctly set up
  As a developer
  I want a simple healthcheck test to pass

  Scenario: Jest test suite runs successfully
    Given the project dependencies are installed
    When I run the test suite
    Then all tests should pass
```

Tasks:

* Create Expo React Native app (TypeScript).
* Configure:

  * Jest + React Native Testing Library
  * ESLint + Prettier
* Add CI config (GitHub Actions) running:

  * `npm run lint`
  * `npm test`
* Add one trivial test (e.g. `adds 1 + 1`) mapped to the feature above.

### Ward 1 – Auth & "empty app shell"

Goal: User can authenticate and see an empty "My Groups" screen.

**Feature (`specs/ward-1-auth-and-shell.feature`):**

```gherkin
Feature: Authentication and basic app shell
  In order to use the app safely
  As a user
  I want to sign in and see my groups

  Scenario: First-time user signs up
    Given I open the app for the first time
    When I choose to sign up with email and password
    And I confirm my email if required
    Then I should be signed in
    And I should see an empty list of groups

  Scenario: Returning user
    Given I have already signed in before
    When I open the app
    Then I should be taken directly to the groups screen
```

Tasks:

* Integrate Supabase Auth (email/password is enough for v1).
* Add:

  * `AuthGate` component
  * Navigation stack (Auth stack + App stack)
* Add tests:

  * Domain/auth tests mocking Supabase client
  * Screen tests verifying:

    * unauthenticated user sees login screen
    * authenticated user sees groups screen

### Ward 2 – Groups: create and join

Goal: User can create a group and join a group via invite code. Simple list UI.

**Feature (`specs/ward-2-groups.feature`):**

```gherkin
Feature: Groups
  In order to share my location with people I trust
  As a user
  I want to create and join groups

  Scenario: Create a new group
    Given I am signed in
    And I am on the groups screen
    When I create a group named "Family"
    Then I should see "Family" in my groups list
    And I should be the owner of that group

  Scenario: Join a group via invite code
    Given there is a group with an invite code
    And I am signed in
    When I enter a valid invite code
    Then I should be added to that group
    And the group should appear in my groups list

  Scenario: Invalid invite code
    Given I am on the join group screen
    When I enter an invalid invite code
    Then I should see an error message
    And I should not join any group
```

Tasks:

* DB tables + migrations (Supabase):

  * `groups`, `group_members`, `invites`
* RLS policies so users only see their own groups.
* Group list screen + "Create group" & "Join by code" flow.
* Tests:

  * Domain tests: group creation, invite code validation (mocking Supabase).
  * Screen tests: user flows for create/join/invalid.

### Ward 3 – Location sharing (basic, manual updates)

Goal: Group members can **manually** update and view last known location (no background yet).

**Feature (`specs/ward-3-location-basic.feature`):**

```gherkin
Feature: Basic location sharing
  In order to know roughly where my group members are
  As a group member
  I want to share my last known location and see others on a map

  Scenario: Enable location sharing
    Given I am a member of a group
    When I enable location sharing for that group
    Then the app should request location permission
    And my last known location should be sent to the backend

  Scenario: View members on the map
    Given location sharing is enabled for some members
    When I open the group map screen
    Then I should see markers for each member with a last known location
    And I should see when each member was last seen

  Scenario: Deny location permission
    Given I have not granted location permissions
    When I try to enable location sharing
    And I deny the permission request
    Then location sharing should remain disabled
    And I should see a clear explanation of why
```

Tasks:

* Location service using Expo Location:

  * Wrap in a testable module (`LocationService`) with an interface.
* DB:

  * `member_latest_location` or `locations` with a view for latest per member.
* Map screen for a single group (simple markers).
* Tests:

  * Domain tests for location toggle logic (no RN/Expo dependencies).
  * Screen tests mocking `LocationService` and backend.

### Ward 4 – Background location updates

Goal: Location updates periodically in background with minimal battery impact.

**Feature (`specs/ward-4-background-location.feature`):**

```gherkin
Feature: Background location updates
  In order to keep locations reasonably up to date
  As a group member
  I want my location to update in the background when sharing is enabled

  Scenario: Background updates while sharing is enabled
    Given I have enabled location sharing for a group
    When I move around with the app in the background
    Then my location should be periodically updated in the backend
    And updates should not happen more frequently than the configured interval

  Scenario: No updates when sharing disabled
    Given I have disabled location sharing
    When the background task runs
    Then no location updates should be sent
```

Tasks:

* Configure Expo background location task.
* Centralize config:

  * minimal distance change
  * minimum interval
* Guard background updates behind:

  * user logged in
  * sharing enabled for at least one group.
* Tests:

  * Domain-level tests for "shouldSendUpdate" decision logic.
  * Integration tests with mocked background task runner.

### Ward 5 – SOS (panic button)

Goal: User can trigger SOS, which logs the event and notifies group members.

**Feature (`specs/ward-5-sos.feature`):**

```gherkin
Feature: SOS panic button
  In order to alert my group in an emergency
  As a group member
  I want to press an SOS button and notify everyone

  Scenario: Trigger SOS
    Given I am signed in and have location sharing enabled
    When I press the SOS button
    Then an SOS event should be recorded with my current location
    And all members of my groups should receive a push notification

  Scenario: SOS without location permission
    Given I have not granted location permissions
    When I press the SOS button
    Then an SOS event should still be recorded (without location)
    And all members should still be notified
```

Tasks:

* DB:

  * `sos_events` table (user_id, group_id, timestamp, lat, lng nullable)
* Supabase Edge Function to send push notifications.
* UI: prominent SOS button (confirm dialog to prevent accidental triggers).
* Tests:

  * Domain tests for SOS event creation logic.
  * Screen tests for SOS flow (mocking notification service).

### Ward 6 – Privacy controls

Goal: User can pause sharing and see who has access to their location.

**Feature (`specs/ward-6-privacy.feature`):**

```gherkin
Feature: Privacy controls
  In order to maintain control over my privacy
  As a user
  I want to see who can see me and pause sharing when needed

  Scenario: View who can see my location
    Given I am a member of multiple groups
    When I open the privacy settings
    Then I should see a list of all users who can see my location
    And the list should be grouped by group name

  Scenario: Pause location sharing
    Given I am sharing my location with a group
    When I pause location sharing
    Then my location should no longer be visible to group members
    And background updates should stop

  Scenario: Resume location sharing
    Given I have paused location sharing
    When I resume location sharing
    Then my location should become visible again
    And background updates should resume
```

Tasks:

* Privacy settings screen showing:

  * List of groups where sharing is enabled
  * List of people who can see user's location
* Pause/resume toggle (per-group or global).
* Tests:

  * Domain tests for pause/resume logic.
  * Screen tests for privacy settings UI.

---

## 5. How to work with me

When I ask you to work on a ward or feature:

1. **Start with the feature file** – show me the Gherkin scenarios first.
2. **Write tests** – show me the test code before implementation.
3. **Implement** – only after tests are in place.
4. **Commit messages** – use conventional commits (e.g., `feat(groups): add create group screen`).

If I say "start Ward X", you should:

1. Create/update the feature file.
2. Create the test files.
3. Implement the minimal code to pass.
4. Summarize what was done.

If something is unclear, **ask me before proceeding**.

---

## 6. Quality checklist (per ward)

Before considering a ward complete:

- [ ] Feature file exists under `/specs`
- [ ] All scenarios have corresponding tests
- [ ] All tests pass (`npm test`)
- [ ] No lint errors (`npm run lint`)
- [ ] Code is typed (no `any` unless justified)
- [ ] No console.log left in production code
- [ ] README updated if needed

---

Let's build something useful, private, and well-tested!
