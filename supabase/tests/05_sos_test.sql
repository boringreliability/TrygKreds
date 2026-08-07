-- ============================================================================
-- Ward 5 -- SOS events and push tokens
-- ============================================================================
--
-- Two tables with opposite visibility rules, and both are worth asserting:
--
--   sos_events  -- readable by the group, because an alert nobody can see is not
--                  an alert. This is also the one place TrygKreds keeps a
--                  position beyond the latest one, which PRIVACY.md states
--                  explicitly rather than burying.
--   push_tokens -- sealed. A token identifies a device, and nothing needs to read
--                  one except the notification function, which runs with the
--                  service role. End users hold no privilege on the table at all;
--                  registration goes through a SECURITY DEFINER function, so an
--                  accidental policy added later still would not open it.
--
-- Fixture:  alice ---- Family ---- bob        carol ---- Other
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
-- 1. Recording an SOS
-- ===========================================================================
SELECT test.check(
  'sos_events: a member can record an SOS for their own group',
  test.execute_as(:'alice', format(
    'INSERT INTO sos_events (user_id, group_id, latitude, longitude, accuracy)
     VALUES (%L, %L, 55.6761, 12.5683, 10)', :'alice', :'g_family')),
  'OK'
);

-- Coordinates are nullable on purpose: an SOS must work when location
-- permission was refused, or when no fix is available indoors.
SELECT test.check(
  'sos_events: an SOS can be recorded without coordinates',
  test.execute_as(:'alice', format(
    'INSERT INTO sos_events (user_id, group_id) VALUES (%L, %L)',
    :'alice', :'g_family')),
  'OK'
);

SELECT test.check(
  'sos_events: latitude and longitude are nullable',
  (
    SELECT count(*)::text
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sos_events'
      AND column_name IN ('latitude', 'longitude')
      AND is_nullable = 'YES'
  ),
  '2'
);

-- ===========================================================================
-- 2. Who can see an SOS
-- ===========================================================================
SELECT test.check(
  'sos_events: a group member sees the SOS',
  test.as(:'bob', format('SELECT 1 FROM sos_events WHERE group_id = %L', :'g_family')),
  'OK:2'
);

SELECT test.check(
  'sos_events: the sender sees their own SOS',
  test.as(:'alice', format('SELECT 1 FROM sos_events WHERE user_id = %L', :'alice')),
  'OK:2'
);

SELECT test.check(
  'sos_events: someone outside the group sees nothing',
  test.as(:'carol', 'SELECT 1 FROM sos_events'),
  'OK:0'
);

-- ===========================================================================
-- 3. An SOS cannot be forged
-- ===========================================================================
SELECT test.check(
  'sos_events: cannot record an SOS attributed to another user',
  test.execute_as(:'bob', format(
    'INSERT INTO sos_events (user_id, group_id) VALUES (%L, %L)',
    :'alice', :'g_family')),
  'ERR:42501'
);

SELECT test.check(
  'sos_events: cannot record an SOS in a group you are not a member of',
  test.execute_as(:'bob', format(
    'INSERT INTO sos_events (user_id, group_id) VALUES (%L, %L)',
    :'bob', :'g_other')),
  'ERR:42501'
);

-- ===========================================================================
-- 4. Deleting your own SOS
-- ===========================================================================
-- A false alarm should not become a permanent record of where you were.
SELECT test.check(
  'sos_events: the sender can delete their own event',
  test.execute_as(:'alice', format(
    'DELETE FROM sos_events WHERE user_id = %L AND latitude IS NULL', :'alice')),
  'OK'
);

SELECT test.check(
  'sos_events: the delete actually removed it',
  (SELECT count(*)::text FROM sos_events WHERE user_id = :'alice'),
  '1'
);

-- A blocked DELETE removes zero rows rather than raising, so the assertion has
-- to check what survived.
SELECT test.check(
  'sos_events: a group member cannot delete someone else''s event',
  test.execute_as(:'bob', format(
    'DELETE FROM sos_events WHERE user_id = %L', :'alice')),
  'OK'
);

SELECT test.check(
  'sos_events: alice''s event survived bob''s attempt',
  (SELECT count(*)::text FROM sos_events WHERE user_id = :'alice'),
  '1'
);

-- ===========================================================================
-- 5. An SOS is a record, not something to quietly rewrite
-- ===========================================================================
SELECT test.check(
  'sos_events: nobody can edit a recorded event',
  (
    SELECT count(*)::text
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sos_events'
      AND cmd = 'UPDATE'
  ),
  '0'
);

-- ===========================================================================
-- 6. Push tokens are sealed
-- ===========================================================================
--
-- The table has no policies and no privileges for end users. Registration goes
-- through a SECURITY DEFINER function, which is not a stylistic choice: Postgres
-- needs the SELECT privilege to evaluate ON CONFLICT DO UPDATE and the WHERE of
-- a DELETE, so a table a client cannot read is a table a client cannot usefully
-- write to either.

SELECT test.check(
  'push_tokens: a direct INSERT is refused',
  test.execute_as(:'alice',
    format('INSERT INTO push_tokens (user_id, token, platform)
            VALUES (%L, ''ExponentPushToken[direct]'', ''ios'')', :'alice')),
  'ERR:42501'
);

SELECT test.check(
  'push_tokens: registering through the function works',
  test.execute_as(:'alice',
    'SELECT public.register_push_token(''ExponentPushToken[alice-device]'', ''ios'')'),
  'OK'
);

SELECT test.check(
  'push_tokens: the token was actually stored',
  (SELECT count(*)::text FROM push_tokens WHERE user_id = :'alice'),
  '1'
);

-- The point of the ward: not even the owner can read a token back. The client
-- therefore re-registers on every app start instead of checking first.
SELECT test.check(
  'push_tokens: the owner CANNOT read their own token back',
  test.as(:'alice', format('SELECT 1 FROM push_tokens WHERE user_id = %L', :'alice')),
  'ERR:42501'
);

SELECT test.check(
  'push_tokens: a group member cannot read anyone''s token',
  test.as(:'bob', 'SELECT 1 FROM push_tokens'),
  'ERR:42501'
);

SELECT test.check(
  'push_tokens: there is no SELECT policy at all',
  (
    SELECT count(*)::text
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'push_tokens'
      AND cmd = 'SELECT'
  ),
  '0'
);

SELECT test.check(
  'push_tokens: no end-user privilege of any kind remains',
  (
    SELECT count(*)::text
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'push_tokens'
      AND grantee IN ('authenticated', 'anon')
  ),
  '0'
);

-- Forgery is impossible by construction: the function derives user_id from
-- auth.uid() and takes no user parameter at all.
SELECT test.check(
  'push_tokens: registering always attributes the token to the caller',
  test.execute_as(:'bob',
    'SELECT public.register_push_token(''ExponentPushToken[bob-device]'', ''android'')'),
  'OK'
);

SELECT test.check(
  'push_tokens: bob''s registration created bob''s row, not alice''s',
  (SELECT count(*)::text FROM push_tokens WHERE user_id = :'bob'),
  '1'
);

SELECT test.check(
  'push_tokens: alice still has exactly her own one row',
  (SELECT count(*)::text FROM push_tokens WHERE user_id = :'alice'),
  '1'
);

SELECT test.check(
  'push_tokens: re-registering the same token is not an error',
  test.execute_as(:'alice',
    'SELECT public.register_push_token(''ExponentPushToken[alice-device]'', ''ios'')'),
  'OK'
);

SELECT test.check(
  'push_tokens: re-registering did not create a duplicate',
  (SELECT count(*)::text FROM push_tokens WHERE user_id = :'alice'),
  '1'
);

-- A device handed from one account to another must not keep alerting the old one.
SELECT test.check(
  'push_tokens: a device re-registered by another account changes hands',
  test.execute_as(:'bob',
    'SELECT public.register_push_token(''ExponentPushToken[alice-device]'', ''ios'')'),
  'OK'
);

SELECT test.check(
  'push_tokens: the device now belongs to bob only',
  (
    SELECT count(*)::text FROM push_tokens
    WHERE token = 'ExponentPushToken[alice-device]' AND user_id = :'bob'
  ),
  '1'
);

SELECT test.check(
  'push_tokens: alice no longer owns that device',
  (SELECT count(*)::text FROM push_tokens WHERE user_id = :'alice'),
  '0'
);

SELECT test.check(
  'push_tokens: an empty token is refused',
  test.execute_as(:'bob', 'SELECT public.register_push_token(''   '', ''ios'')'),
  'ERR:22023'
);

-- The notification function runs with the service role, which is the only thing
-- that may read a token.
SELECT test.check(
  'push_tokens: the service role CAN read tokens',
  (
    SELECT count(*)::text
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'push_tokens'
      AND privilege_type = 'SELECT'
      AND grantee = 'service_role'
  ),
  '1'
);

SELECT test.check(
  'push_tokens: the owner can remove their own token on sign-out',
  test.execute_as(:'bob',
    'SELECT public.remove_my_push_token(''ExponentPushToken[bob-device]'')'),
  'OK'
);

SELECT test.check(
  'push_tokens: the removal took effect',
  (
    SELECT count(*)::text FROM push_tokens
    WHERE token = 'ExponentPushToken[bob-device]'
  ),
  '0'
);

-- Passing a token you do not own deletes nothing rather than someone else's row.
SELECT test.check(
  'push_tokens: removing a token you do not own is a no-op',
  test.execute_as(:'carol',
    'SELECT public.remove_my_push_token(''ExponentPushToken[alice-device]'')'),
  'OK'
);

SELECT test.check(
  'push_tokens: bob''s device survived carol''s attempt',
  (
    SELECT count(*)::text FROM push_tokens
    WHERE token = 'ExponentPushToken[alice-device]' AND user_id = :'bob'
  ),
  '1'
);

\o

SELECT test.finish();

ROLLBACK;
