# Privacy contract

TrygKreds exists because the alternatives sell location data, run ads and upsell
hard. That is not a claim you should have to take on trust, so this document
states exactly what is stored, for how long, and who can read it -- and, where
possible, points at the check that enforces it.

Everything below describes the code in this repository. Where a guarantee is
enforced mechanically, the enforcing test or script is named. Where something is
a limitation rather than a guarantee, it is listed under
[Limitations](#limitations-and-honest-caveats) rather than dressed up.

## The short version

1. **No third-party SDKs with network access.** No analytics, no ad networks, no
   crash reporting, no device identifiers. Enforced by
   `scripts/check-dependencies.js`, which fails the build on any runtime
   dependency that is not on an explicit allowlist. One caveat about map tiles
   is described under [Limitations](#limitations-and-honest-caveats).
2. **No location history.** One row per user per group, overwritten in place --
   including by background updates. There is no table that could answer "where
   was she last Tuesday?", because the old value is gone the moment a new one
   arrives. The single exception is an SOS you send deliberately, which is kept
   as a record and which you can delete; see
   [`sos_events`](#sos_events--the-one-retained-position).
3. **Turning sharing off deletes your position.** It is not merely hidden behind
   a policy. A position sitting in the database is a position sitting in the
   database.
4. **Self-hostable.** The app talks only to the Supabase instance you point it
   at. There is no server operated by this project.
5. **No ads, no tracking, no upsells.** There is no revenue model that would
   need them.

## What is stored

The complete list. Every table lives in your own Supabase project.

### `auth.users` -- managed by Supabase Auth

| Field              | Why               |
| ------------------ | ----------------- |
| email              | Sign-in identity  |
| encrypted password | Sign-in           |
| timestamps         | Account lifecycle |

**Who can read it:** nobody through the app. Clients have no access to this
table; the app never selects from it. This is why an email address does not
appear anywhere else.

**Retention:** until you delete the account.

### `profiles`

| Field                      | Why                                      |
| -------------------------- | ---------------------------------------- |
| `id`                       | Links to the account                     |
| `display_name`             | What group members see instead of a UUID |
| `created_at`, `updated_at` | Bookkeeping                              |

`display_name` is chosen by you and does not have to be your real name.

**Who can read it:** you, and anyone you share at least one group with. Leaving
a group revokes it -- asserted in `supabase/tests/03_profiles_test.sql`.

**Deliberately absent:** any email address or contact detail. Because a profile
is readable by everyone in your groups, an email column here would hand your
address to every member of every group you join. A test asserts the table has no
column whose name contains "email".

**Retention:** until you delete the account, which removes the profile with it.

### `groups`

| Field                                              | Why                                               |
| -------------------------------------------------- | ------------------------------------------------- |
| `name`                                             | So you can tell your circles apart                |
| `owner_id`                                         | Who may rename, delete and rotate the invite code |
| `invite_code`                                      | Joining                                           |
| `invite_code_expires_at`, `invite_code_revoked_at` | So a code in an old SMS stops working             |
| timestamps                                         | Bookkeeping                                       |

**Who can read it:** members of that group only. Knowing an invite code does not
grant read access to the table -- redemption goes through a single server-side
function. Asserted in `supabase/tests/02_rls_test.sql`.

**Retention:** until the owner deletes the group.

### `group_members`

| Field                         | Why                    |
| ----------------------------- | ---------------------- |
| `group_id`, `user_id`, `role` | Who is in which circle |
| `joined_at`                   | Bookkeeping            |

**Who can read it:** members of the same group.

**Retention:** until you leave the group or delete the account.

### `member_locations` -- the sensitive one

| Field                               | Why                            |
| ----------------------------------- | ------------------------------ |
| `user_id`, `group_id`               | Whose position, in which group |
| `latitude`, `longitude`, `accuracy` | The position                   |
| `updated_at`                        | "Last seen at 14:32"           |

**Exactly one row per user per group.** The table carries
`UNIQUE(user_id, group_id)` and every write is an upsert against it. That
constraint is the no-history guarantee, and it is load-bearing: **removing it,
or replacing an upsert with an insert, would turn this app into the thing it
exists to avoid.** Treat any change here as a change to the privacy contract.

**Who can read it:** members of a group you share, and only while you are
actively sharing with that group. Someone you share no group with can never read
it. Both are asserted in `supabase/tests/02_rls_test.sql`, against a real
PostgreSQL rather than a mock.

**Retention:** until you turn sharing off, leave the group, or delete your
account. Turning sharing off **deletes** the row -- `disableLocationSharing()`
does the deletion itself, so no caller can turn sharing off and leave the
position behind.

**Background updates:** while you are sharing, the app updates this row in the
background so "last seen" stays meaningful. It is an upsert against the
constraint above, so the row is _replaced_, never added to. Updates are rate
limited to one per five minutes per group and require having moved at least 100
metres; the thresholds live in `src/domain/backgroundLocation.ts`. The background
task re-checks on every run that you are signed in and sharing with at least one
group, and stops itself if not.

### `location_sharing_settings`

| Field                                    | Why                                     |
| ---------------------------------------- | --------------------------------------- |
| `user_id`, `group_id`, `sharing_enabled` | Whether you are sharing with that group |
| timestamps                               | Bookkeeping                             |

**Who can read it:** you, and members of a group you share -- so the app can show
who is currently sharing.

**Retention:** until you leave the group or delete the account.

### `sos_events` -- the one retained position

| Field                                          | Why                         |
| ---------------------------------------------- | --------------------------- |
| `user_id`, `group_id`                          | Who raised the alarm, where |
| `latitude`, `longitude`, `accuracy` (nullable) | Where they were, if known   |
| `created_at`                                   | When                        |

This is the one place TrygKreds keeps a position beyond the latest one, and it is
worth being blunt about: a table of SOS events with coordinates and timestamps
**is** a sparse location history. It is here because an emergency record that
vanishes is useless -- if you press SOS and later need to show someone where you
were, that has to still exist.

Three things bound it. It is only ever written when you deliberately press the
button, never automatically. The coordinates are nullable, so an SOS raised
without location permission holds none. And you can delete your own events, so a
false alarm need not stay a permanent record of where you were.

**Who can read it:** members of the group it was raised in. An alert nobody can
see is not an alert. Nobody outside the group can read it, and nobody can edit
one -- there is no UPDATE policy, so a recorded alert cannot be quietly moved.
Asserted in `supabase/tests/05_sos_test.sql`.

**Retention:** until you delete the event, leave the group, or delete your
account.

### `push_tokens` -- sealed

| Field                      | Why                             |
| -------------------------- | ------------------------------- |
| `user_id`                  | Whose device                    |
| `token`                    | Where to deliver a notification |
| `platform`                 | iOS, Android or web             |
| `created_at`, `updated_at` | Bookkeeping                     |

A push token identifies a single app install, which makes it a device identifier
-- so this table is closed harder than any other.

**Who can read it:** nothing except the notification function, which runs with the
service role. End users hold **no privilege on the table at all**: not select, not
insert, not update, not delete. Registration goes through a `SECURITY DEFINER`
function that derives the owner from the session, so a token cannot be registered
against someone else's account. Not even you can read your own token back -- which
is why the app re-registers on every start rather than checking what is stored.
Asserted in `supabase/tests/05_sos_test.sql`.

**Retention:** until you sign out on that device, or delete your account.

## What is never stored

- Location history, tracks, or traces of any kind.
- Speed, driving behaviour, phone-usage or battery statistics.
- Device identifiers or advertising IDs. A push token is stored only to deliver
  SOS alerts, is never used to identify or track you, and is readable by
  nothing but the function that sends them.
- Contact lists, photos, calendars, or anything else outside the list above.
- Any copy of your email address outside `auth.users`.

## How the guarantees are enforced

Writing a promise down is not enforcement. These run in CI on every pull
request, and fail the build rather than warn:

| Guarantee                                        | Enforced by                                           |
| ------------------------------------------------ | ----------------------------------------------------- |
| No unapproved runtime dependency                 | `scripts/check-dependencies.js` -- explicit allowlist |
| No network access outside your Supabase instance | `scripts/check-network-access.js`                     |
| Locations are unreadable across group boundaries | `supabase/tests/02_rls_test.sql`                      |
| Locations are unreadable once sharing is off     | `supabase/tests/02_rls_test.sql`                      |
| Views do not bypass row level security           | `supabase/tests/02_rls_test.sql`                      |
| Profiles are visible only within shared groups   | `supabase/tests/03_profiles_test.sql`                 |
| Profiles hold no email address                   | `supabase/tests/03_profiles_test.sql`                 |
| Turning sharing off deletes the position         | `src/domain/location.test.ts`                         |
| Background updates cannot accumulate a history   | `supabase/tests/04_no_history_test.sql`               |
| No table looks like a location history           | `supabase/tests/04_no_history_test.sql`               |
| Background work stops when signed out            | `src/domain/backgroundLocationSync.test.ts`           |
| SOS events are visible only inside the group     | `supabase/tests/05_sos_test.sql`                      |
| An SOS cannot be forged or edited                | `supabase/tests/05_sos_test.sql`                      |
| Push tokens are unreadable, even by their owner  | `supabase/tests/05_sos_test.sql`                      |
| SOS notifications carry no coordinates           | `src/domain/sos.test.ts`, `supabase/functions/*.test` |

The row level security tests run against a real PostgreSQL instance, not against
mocks. This matters: the application test suite mocks Supabase entirely, so it
would pass just as happily against a database with row level security switched
off. Run them with `npm run test:rls`.

The dependency allowlist is the documentation. Adding a dependency means editing
that list on purpose, in a diff a reviewer can see. That friction is the point.

## Limitations and honest caveats

Things this document will not pretend about.

- **Map tiles come from Apple or Google.** `react-native-maps` renders MapKit on
  iOS and Google Maps on Android. Displaying a map means requesting tiles from
  that provider, and your approximate viewport is visible to them, subject to
  their privacy policy rather than this one. This is the one third-party network
  path in the app. It is the cost of showing a map at all; a self-hosted tile
  source would remove it and is a legitimate future change.
- **Push notifications pass through Expo, Apple and Google.** SOS alerts are
  delivered with `expo-notifications`. Minting a push token contacts Expo's
  servers, and delivery goes through Expo's relay to Apple's and Google's push
  services (`exp.host`, then Apple's and Google's own endpoints). Those parties
  therefore see that a notification was sent, to which device, and its text -- under their privacy policies, not this one. This is why
  the SOS payload deliberately carries **no coordinates**: it names the sender and
  the group, and recipients open the app to read the position from your database,
  where row level security still applies. A self-hosted push setup using Firebase
  and APNs directly would remove Expo from the path, and is a legitimate future
  change. If you never press SOS, no notification is ever sent.
- **Device location on Android may be network-assisted.** The OS location
  provider can use Google Play Services to resolve a position from nearby
  networks. That happens below this app, and applies to every app that asks for
  a location.
- **Your Supabase provider sees your data at rest.** If you use hosted Supabase,
  they operate the database. Self-host to remove them from the picture -- nothing
  in the app depends on a hosted instance.
- **Group members see what you share.** The whole point is to share your position
  with people you have chosen. The guarantees here are about everyone _else_.
- **A group owner can see who is in their group.** Membership is not private
  within a circle.
- **Email deliverability involves your Supabase project's mail provider** for
  sign-up confirmation, if you enable it.
- **No end-to-end encryption.** Positions are stored in plaintext columns and
  protected by row level security, not by cryptography. Your database
  administrator -- likely you -- can read them. E2EE would be a genuine
  improvement and is not implemented.
- **Not audited.** These are the guarantees the code makes and the tests check.
  No external party has reviewed them.

## Deleting your data

- **One group:** turn off sharing -- the stored position is deleted immediately.
- **Leave a group:** your membership row goes, and with it that group's access to
  your position and profile.
- **Everything:** delete the account. Every table above references
  `auth.users(id)` with `ON DELETE CASCADE`, so removing the account removes the
  profile, memberships, sharing settings and positions with it.

## Changing this document

If you change what is stored, who can read it, or how long it is kept, this file
and the checks it names have to change in the same pull request. A privacy
contract that drifts from the code is worse than none, because it is believed.
