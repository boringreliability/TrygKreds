-- ============================================================================
-- Ward 3.2 -- RLS hardening: the privacy guarantees, asserted against a real
-- PostgreSQL instance.
-- ============================================================================
--
-- Every assertion here is a promise TrygKreds makes to its users. They are
-- written first, and they fail against the Ward 2 / Ward 3 migrations:
--
--   * the group_members SELECT policy queries group_members, so Postgres
--     aborts with 42P17 "infinite recursion detected in policy"
--   * groups_with_member_count and member_locations_with_sharing were created
--     without security_invoker, so they run with the view owner's rights and
--     ignore every policy on the tables underneath
--   * invite codes never expire and cannot be revoked
--
-- Fixture (three users, two groups that must stay isolated from each other):
--
--   alice ---- group_family ---- bob        carol ---- group_other
--
-- carol shares no group with alice or bob. Nothing about carol may ever be
-- visible to them, and vice versa.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'
\set carol '33333333-3333-3333-3333-333333333333'

INSERT INTO auth.users (id, email) VALUES
  (:'alice', 'alice@example.test'),
  (:'bob',   'bob@example.test'),
  (:'carol', 'carol@example.test');

-- Groups. The add_owner_as_member trigger enrols each owner automatically.
INSERT INTO groups (id, name, owner_id, invite_code) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Family', :'alice', 'FAMILY01'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Other',  :'carol', 'OTHER002');

\set g_family 'aaaaaaaa-0000-0000-0000-000000000001'
\set g_other  'bbbbbbbb-0000-0000-0000-000000000002'

-- bob joins the family group; carol stays alone in hers.
INSERT INTO group_members (group_id, user_id, role)
VALUES (:'g_family', :'bob', 'member');

-- Everyone has a stored location, and everyone is sharing to begin with.
INSERT INTO member_locations (user_id, group_id, latitude, longitude, accuracy) VALUES
  (:'alice', :'g_family', 55.6761, 12.5683, 10),
  (:'bob',   :'g_family', 55.6800, 12.5700, 10),
  (:'carol', :'g_other',  56.1500, 10.2100, 10);

INSERT INTO location_sharing_settings (user_id, group_id, sharing_enabled) VALUES
  (:'alice', :'g_family', true),
  (:'bob',   :'g_family', true),
  (:'carol', :'g_other',  true);


-- test.check() returns void; silence the empty result table it would print for
-- every assertion. The pass/fail report from test.finish() is raised as notices
-- on stderr, so it is unaffected by this redirect.
\o /dev/null

-- ===========================================================================
-- 1. group_members queries must not recurse
-- ===========================================================================
SELECT test.check(
  'group_members: a member can list their group''s members without recursion',
  test.as(:'alice', format('SELECT 1 FROM group_members WHERE group_id = %L', :'g_family')),
  'OK:2'
);

SELECT test.check(
  'group_members: a non-member sees no rows (and no error)',
  test.as(:'carol', format('SELECT 1 FROM group_members WHERE group_id = %L', :'g_family')),
  'OK:0'
);

SELECT test.check(
  'groups: a member can read their own group',
  test.as(:'alice', format('SELECT 1 FROM groups WHERE id = %L', :'g_family')),
  'OK:1'
);

SELECT test.check(
  'groups: a user cannot read a group they are not a member of',
  test.as(:'alice', format('SELECT 1 FROM groups WHERE id = %L', :'g_other')),
  'OK:0'
);


-- ===========================================================================
-- 2. Locations: the core privacy promise
-- ===========================================================================
SELECT test.check(
  'member_locations: alice sees bob''s location (same group, sharing on)',
  test.as(:'alice', format('SELECT 1 FROM member_locations WHERE user_id = %L', :'bob')),
  'OK:1'
);

SELECT test.check(
  'member_locations: alice CANNOT see carol''s location (no shared group)',
  test.as(:'alice', format('SELECT 1 FROM member_locations WHERE user_id = %L', :'carol')),
  'OK:0'
);

SELECT test.check(
  'member_locations: carol CANNOT see bob''s location (no shared group)',
  test.as(:'carol', format('SELECT 1 FROM member_locations WHERE user_id = %L', :'bob')),
  'OK:0'
);

-- bob stops sharing. His stored row is about to be removed by the app, but the
-- policy must already hide it regardless.
UPDATE location_sharing_settings
   SET sharing_enabled = false
 WHERE user_id = :'bob' AND group_id = :'g_family';

SELECT test.check(
  'member_locations: alice CANNOT see bob''s location once bob stops sharing',
  test.as(:'alice', format('SELECT 1 FROM member_locations WHERE user_id = %L', :'bob')),
  'OK:0'
);

SELECT test.check(
  'member_locations: bob can still see his own location while not sharing',
  test.as(:'bob', format('SELECT 1 FROM member_locations WHERE user_id = %L', :'bob')),
  'OK:1'
);

UPDATE location_sharing_settings
   SET sharing_enabled = true
 WHERE user_id = :'bob' AND group_id = :'g_family';


-- ===========================================================================
-- 3. Views must respect the policies of the tables underneath
-- ===========================================================================
SELECT test.check(
  'view member_locations_with_sharing: alice sees bob (same group, sharing on)',
  test.as(:'alice', format('SELECT 1 FROM member_locations_with_sharing WHERE user_id = %L', :'bob')),
  'OK:1'
);

SELECT test.check(
  'view member_locations_with_sharing: alice CANNOT see carol',
  test.as(:'alice', format('SELECT 1 FROM member_locations_with_sharing WHERE user_id = %L', :'carol')),
  'OK:0'
);

SELECT test.check(
  'view member_locations_with_sharing: leaks nothing beyond alice''s own group',
  test.as(:'alice', 'SELECT 1 FROM member_locations_with_sharing'),
  'OK:2'
);

SELECT test.check(
  'view groups_with_member_count: alice sees only her own group',
  test.as(:'alice', 'SELECT 1 FROM groups_with_member_count'),
  'OK:1'
);

SELECT test.check(
  'view groups_with_member_count: alice CANNOT see carol''s group',
  test.as(:'alice', format('SELECT 1 FROM groups_with_member_count WHERE id = %L', :'g_other')),
  'OK:0'
);


-- ===========================================================================
-- 4. Sharing settings
-- ===========================================================================
SELECT test.check(
  'location_sharing_settings: alice sees her group''s settings',
  test.as(:'alice', format('SELECT 1 FROM location_sharing_settings WHERE group_id = %L', :'g_family')),
  'OK:2'
);

SELECT test.check(
  'location_sharing_settings: alice CANNOT see carol''s settings',
  test.as(:'alice', format('SELECT 1 FROM location_sharing_settings WHERE user_id = %L', :'carol')),
  'OK:0'
);

SELECT test.check(
  'location_sharing_settings: exactly one SELECT policy remains',
  (
    SELECT count(*)::text
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'location_sharing_settings'
      AND cmd = 'SELECT'
  ),
  '1'
);


-- ===========================================================================
-- 5. A user may not write another user's location
-- ===========================================================================
SELECT test.check(
  'member_locations: carol cannot insert a location on bob''s behalf',
  test.execute_as(:'carol', format(
    'INSERT INTO member_locations (user_id, group_id, latitude, longitude, accuracy)
     VALUES (%L, %L, 1, 1, 1)', :'bob', :'g_other')),
  'ERR:42501'   -- insufficient_privilege: the WITH CHECK rejects it
);

-- Knowing a group's UUID must not be enough to write into it. Carol is writing
-- a row that is genuinely about herself, so `user_id = auth.uid()` alone would
-- have allowed this; membership has to be part of the check.
SELECT test.check(
  'member_locations: carol cannot write her own location into a group she is not in',
  test.execute_as(:'carol', format(
    'INSERT INTO member_locations (user_id, group_id, latitude, longitude, accuracy)
     VALUES (%L, %L, 1, 1, 1)', :'carol', :'g_family')),
  'ERR:42501'
);

SELECT test.check(
  'group_members: carol cannot enrol herself in a group by its UUID alone',
  test.execute_as(:'carol', format(
    'INSERT INTO group_members (group_id, user_id, role) VALUES (%L, %L, ''member'')',
    :'g_family', :'carol')),
  'ERR:42501'
);

SELECT test.check(
  'location_sharing_settings: carol cannot create settings in a group she is not in',
  test.execute_as(:'carol', format(
    'INSERT INTO location_sharing_settings (user_id, group_id, sharing_enabled)
     VALUES (%L, %L, true)', :'carol', :'g_family')),
  'ERR:42501'
);


-- ===========================================================================
-- 6. Invite codes must be expirable, revocable and rotatable
-- ===========================================================================

-- Redemption goes through a SECURITY DEFINER function. It has to: RLS cannot
-- express "readable only by someone who already knows the code" -- any policy
-- permissive enough to allow the lookup would also allow SELECT * over every
-- group in the table.
SELECT test.check(
  'invite: a valid code lets a non-member join',
  test.as(:'bob', 'SELECT public.join_group_by_invite_code(''OTHER002'')'),
  'OK:1'
);

SELECT test.check(
  'invite: bob is now a member of the group he joined',
  test.as(:'bob', format('SELECT 1 FROM group_members WHERE group_id = %L AND user_id = %L',
                         :'g_other', :'bob')),
  'OK:1'
);

-- Undo, so the remaining assertions start from a clean membership.
DELETE FROM group_members WHERE group_id = :'g_other' AND user_id = :'bob';

SELECT test.check(
  'invite: an unknown code is rejected',
  test.as(:'bob', 'SELECT public.join_group_by_invite_code(''NOSUCH99'')'),
  'ERR:P0002'   -- no_data_found
);

-- Expire the code.
UPDATE groups SET invite_code_expires_at = now() - interval '1 day'
 WHERE id = :'g_other';

SELECT test.check(
  'invite: an EXPIRED code is rejected',
  test.as(:'bob', 'SELECT public.join_group_by_invite_code(''OTHER002'')'),
  'ERR:P0002'
);

UPDATE groups SET invite_code_expires_at = now() + interval '7 days'
 WHERE id = :'g_other';

-- Revoke the code.
UPDATE groups SET invite_code_revoked_at = now() WHERE id = :'g_other';

SELECT test.check(
  'invite: a REVOKED code is rejected',
  test.as(:'bob', 'SELECT public.join_group_by_invite_code(''OTHER002'')'),
  'ERR:P0002'
);

UPDATE groups SET invite_code_revoked_at = NULL WHERE id = :'g_other';

-- Rotation must invalidate the old code -- the whole point is that a code left
-- in an old SMS stops working.
SELECT test.check(
  'invite: the owner can rotate the code',
  test.as(:'carol', format('SELECT public.rotate_invite_code(%L)', :'g_other')),
  'OK:1'
);

SELECT test.check(
  'invite: the OLD code no longer works after rotation',
  test.as(:'bob', 'SELECT public.join_group_by_invite_code(''OTHER002'')'),
  'ERR:P0002'
);

SELECT test.check(
  'invite: a non-owner cannot rotate the code',
  test.as(:'bob', format('SELECT public.rotate_invite_code(%L)', :'g_family')),
  'ERR:42501'
);

SELECT test.check(
  'invite: rotation clears any prior revocation and sets a fresh expiry',
  (
    SELECT (invite_code_revoked_at IS NULL
            AND invite_code_expires_at > now())::text
    FROM groups WHERE id = :'g_other'
  ),
  'true'
);

SELECT test.check(
  'invite: codes carry at least 40 bits of entropy (10 hex characters)',
  (SELECT (length(invite_code) >= 10)::text FROM groups WHERE id = :'g_other'),
  'true'
);

-- Direct table access must stay closed even when the caller knows the code.
-- Carol is the outsider here: she shares no group with alice or bob, so the
-- family code must buy her nothing on the table itself. (Asking this of bob
-- would prove nothing -- he is a member of that group and may read it.)
SELECT test.check(
  'invite: knowing a code does NOT grant SELECT on the groups table',
  test.as(:'carol', 'SELECT 1 FROM groups WHERE invite_code = ''FAMILY01'''),
  'OK:0'
);


-- ===========================================================================
-- 7. is_group_member must not be a privilege-escalation hole
-- ===========================================================================
SELECT test.check(
  'is_group_member: reports true for the caller''s own membership',
  test.as(:'alice', format('SELECT 1 WHERE public.is_group_member(%L)', :'g_family')),
  'OK:1'
);

SELECT test.check(
  'is_group_member: reports false for a group the caller is not in',
  test.as(:'alice', format('SELECT 1 WHERE public.is_group_member(%L)', :'g_other')),
  'OK:0'
);


\o

SELECT test.finish();

ROLLBACK;
