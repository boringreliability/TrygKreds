-- ============================================================================
-- Ward 3.3 -- profiles and display names: the privacy boundary
-- ============================================================================
--
-- A profile is readable by everyone you share a group with. That makes it the
-- one table in TrygKreds where a leak is a leak of identity rather than
-- location, so the boundary gets the same treatment as member_locations.
--
-- Fixture:  alice ---- Family ---- bob        carol ---- Other
--
-- carol shares no group with alice or bob.
-- ============================================================================

BEGIN;

\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'
\set carol '33333333-3333-3333-3333-333333333333'

INSERT INTO auth.users (id, email) VALUES
  (:'alice', 'alice@example.test'),
  (:'bob',   'bob@example.test'),
  (:'carol', 'carol@example.test');

INSERT INTO groups (id, name, owner_id, invite_code) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Family', :'alice', 'FAMILY0001'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Other',  :'carol', 'OTHER00002');

\set g_family 'aaaaaaaa-0000-0000-0000-000000000001'
\set g_other  'bbbbbbbb-0000-0000-0000-000000000002'

INSERT INTO group_members (group_id, user_id, role)
VALUES (:'g_family', :'bob', 'member');

\o /dev/null

-- ===========================================================================
-- 1. A profile is created automatically with the account
-- ===========================================================================
-- The three INSERTs into auth.users above should each have produced a profile
-- via the trigger. Nothing in this suite created them explicitly.
SELECT test.check(
  'profiles: a row is created automatically for every new account',
  (SELECT count(*)::text FROM profiles
    WHERE id IN (:'alice', :'bob', :'carol')),
  '3'
);

SELECT test.check(
  'profiles: a new profile starts with no display name',
  (SELECT (display_name IS NULL)::text FROM profiles WHERE id = :'alice'),
  'true'
);

-- ===========================================================================
-- 2. Email must not be stored here
-- ===========================================================================
-- profiles is readable by everyone you share a group with, so an email column
-- would hand your address to every member of every group you join. It already
-- lives in auth.users, which the client cannot read.
SELECT test.check(
  'profiles: the table has no email column',
  (
    SELECT count(*)::text
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name ILIKE '%email%'
  ),
  '0'
);

-- ===========================================================================
-- 3. Visibility follows shared group membership
-- ===========================================================================
UPDATE profiles SET display_name = 'Mor' WHERE id = :'alice';
UPDATE profiles SET display_name = 'Far' WHERE id = :'bob';
UPDATE profiles SET display_name = 'Carol' WHERE id = :'carol';

SELECT test.check(
  'profiles: alice can read her own profile',
  test.as(:'alice', format('SELECT 1 FROM profiles WHERE id = %L', :'alice')),
  'OK:1'
);

SELECT test.check(
  'profiles: alice can read the profile of a fellow group member',
  test.as(:'alice', format('SELECT 1 FROM profiles WHERE id = %L', :'bob')),
  'OK:1'
);

SELECT test.check(
  'profiles: alice CANNOT read the profile of someone she shares no group with',
  test.as(:'alice', format('SELECT 1 FROM profiles WHERE id = %L', :'carol')),
  'OK:0'
);

SELECT test.check(
  'profiles: carol CANNOT read alice''s profile either',
  test.as(:'carol', format('SELECT 1 FROM profiles WHERE id = %L', :'alice')),
  'OK:0'
);

SELECT test.check(
  'profiles: an unqualified select leaks nothing beyond alice''s own circle',
  test.as(:'alice', 'SELECT 1 FROM profiles'),
  'OK:2'
);

-- ===========================================================================
-- 4. Visibility is revoked when the group tie is cut
-- ===========================================================================
DELETE FROM group_members WHERE group_id = :'g_family' AND user_id = :'bob';

SELECT test.check(
  'profiles: alice can no longer read bob''s profile once he leaves the group',
  test.as(:'alice', format('SELECT 1 FROM profiles WHERE id = %L', :'bob')),
  'OK:0'
);

INSERT INTO group_members (group_id, user_id, role)
VALUES (:'g_family', :'bob', 'member');

-- ===========================================================================
-- 5. Only you may change your own display name
-- ===========================================================================
SELECT test.check(
  'profiles: alice can set her own display name',
  test.execute_as(:'alice', format(
    'UPDATE profiles SET display_name = ''Mormor'' WHERE id = %L', :'alice')),
  'OK'
);

SELECT test.check(
  'profiles: alice''s own update actually took effect',
  (SELECT display_name FROM profiles WHERE id = :'alice'),
  'Mormor'
);

-- A blocked UPDATE affects zero rows rather than raising, so the assertion has
-- to check the stored value, not just that the statement returned OK.
SELECT test.check(
  'profiles: alice cannot change a fellow group member''s display name',
  test.execute_as(:'alice', format(
    'UPDATE profiles SET display_name = ''hacked'' WHERE id = %L', :'bob')),
  'OK'
);

SELECT test.check(
  'profiles: bob''s display name is unchanged after alice''s attempt',
  (SELECT display_name FROM profiles WHERE id = :'bob'),
  'Far'
);

SELECT test.check(
  'profiles: alice cannot change the display name of a stranger',
  test.execute_as(:'alice', format(
    'UPDATE profiles SET display_name = ''hacked'' WHERE id = %L', :'carol')),
  'OK'
);

SELECT test.check(
  'profiles: carol''s display name is unchanged',
  (SELECT display_name FROM profiles WHERE id = :'carol'),
  'Carol'
);

-- ===========================================================================
-- 6. A profile cannot be forged for someone else
-- ===========================================================================
SELECT test.check(
  'profiles: alice cannot insert a profile row for another user',
  test.execute_as(:'alice', format(
    'INSERT INTO profiles (id, display_name) VALUES (%L, ''forged'')',
    '44444444-4444-4444-4444-444444444444')),
  'ERR:42501'
);

-- ===========================================================================
-- 7. Display name length is bounded at the database, not only in the UI
-- ===========================================================================
SELECT test.check(
  'profiles: an over-long display name is rejected',
  test.execute_as(:'alice', format(
    'UPDATE profiles SET display_name = %L WHERE id = %L',
    repeat('x', 41), :'alice')),
  'ERR:23514'   -- check_violation
);

SELECT test.check(
  'profiles: a blank display name is rejected',
  test.execute_as(:'alice', format(
    'UPDATE profiles SET display_name = ''   '' WHERE id = %L', :'alice')),
  'ERR:23514'
);

\o

SELECT test.finish();

ROLLBACK;
