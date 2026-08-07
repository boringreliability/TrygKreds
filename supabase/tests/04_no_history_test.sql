-- ============================================================================
-- Ward 4 -- no location history, asserted at the database
-- ============================================================================
--
-- PRIVACY.md promises there is no table that could answer "where was she last
-- Tuesday?". Background updates are what would break that promise: a task that
-- INSERTs instead of upserting would quietly accumulate a track, one row per
-- wake-up, and every other guarantee would still look fine.
--
-- The guarantee rests on UNIQUE(user_id, group_id). These assertions check that
-- the constraint exists, that it actually refuses a second row, and that a
-- stream of updates leaves exactly one position holding the newest coordinates.
-- ============================================================================

BEGIN;

\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'

INSERT INTO auth.users (id, email) VALUES
  (:'alice', 'alice@example.test'),
  (:'bob',   'bob@example.test');

INSERT INTO groups (id, name, owner_id, invite_code) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Family', :'alice', 'FAMILY0001');

\set g_family 'aaaaaaaa-0000-0000-0000-000000000001'

INSERT INTO group_members (group_id, user_id, role)
VALUES (:'g_family', :'bob', 'member');

INSERT INTO location_sharing_settings (user_id, group_id, sharing_enabled)
VALUES (:'alice', :'g_family', true);

\o /dev/null

-- ===========================================================================
-- 1. The constraint that makes the guarantee
-- ===========================================================================
SELECT test.check(
  'member_locations: has a UNIQUE constraint on (user_id, group_id)',
  (
    SELECT count(*)::text
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'member_locations'
      AND c.contype = 'u'
      AND (
        -- attname is `name`; cast so it compares against a text[] literal.
        SELECT array_agg(a.attname::text ORDER BY a.attname::text)
        FROM unnest(c.conkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) = ARRAY['group_id', 'user_id']
  ),
  '1'
);

-- ===========================================================================
-- 2. A second row for the same user and group is refused outright
-- ===========================================================================
INSERT INTO member_locations (user_id, group_id, latitude, longitude, accuracy)
VALUES (:'alice', :'g_family', 55.6761, 12.5683, 10);

SELECT test.check(
  'member_locations: a second INSERT for the same user and group is rejected',
  test.execute_as(:'alice', format(
    'INSERT INTO member_locations (user_id, group_id, latitude, longitude, accuracy)
     VALUES (%L, %L, 56.1500, 10.2100, 10)', :'alice', :'g_family')),
  'ERR:23505'   -- unique_violation
);

-- ===========================================================================
-- 3. A stream of updates leaves exactly one position
-- ===========================================================================
-- Stands in for a background task waking repeatedly as the user moves. Each
-- write is the upsert that updateMyLocation() performs.
DO $$
DECLARE
  i integer;
BEGIN
  FOR i IN 1..25 LOOP
    BEGIN
      INSERT INTO member_locations (user_id, group_id, latitude, longitude, accuracy)
      VALUES (
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000001',
        55.6761 + (i * 0.001),
        12.5683 + (i * 0.001),
        10
      )
      ON CONFLICT (user_id, group_id) DO UPDATE
        SET latitude   = EXCLUDED.latitude,
            longitude  = EXCLUDED.longitude,
            accuracy   = EXCLUDED.accuracy,
            updated_at = now();
    EXCEPTION WHEN OTHERS THEN
      -- Reached when the UNIQUE constraint the upsert targets has been removed.
      -- Swallow and stop, so the assertions below report which guarantee broke
      -- instead of the suite aborting on a raw ON CONFLICT error.
      EXIT;
    END;
  END LOOP;
END
$$;

SELECT test.check(
  'member_locations: 25 background updates leave exactly one stored position',
  (
    SELECT count(*)::text FROM member_locations
    WHERE user_id = :'alice' AND group_id = :'g_family'
  ),
  '1'
);

-- Aggregated rather than a bare scalar subquery: if the UNIQUE constraint were
-- ever removed there would be several rows here, and this assertion has to
-- report that rather than abort the run on "more than one row returned".
SELECT test.check(
  'member_locations: the one row holds the newest coordinates',
  (
    SELECT max(round(latitude::numeric, 4))::text FROM member_locations
    WHERE user_id = :'alice' AND group_id = :'g_family'
  ),
  round((55.6761 + 25 * 0.001)::numeric, 4)::text
);

SELECT test.check(
  'member_locations: no trace of any earlier position remains',
  (
    SELECT count(*)::text FROM member_locations
    WHERE user_id = :'alice'
      AND group_id = :'g_family'
      AND round(latitude::numeric, 4) <> round((55.6761 + 25 * 0.001)::numeric, 4)
  ),
  '0'
);

-- ===========================================================================
-- 4. One position per group, but groups stay independent
-- ===========================================================================
-- The constraint is per (user, group): sharing with two groups means two rows,
-- which is one position each rather than a history.
INSERT INTO groups (id, name, owner_id, invite_code)
VALUES ('cccccccc-0000-0000-0000-000000000003', 'Work', :'alice', 'WORK000003');

\set g_work 'cccccccc-0000-0000-0000-000000000003'

INSERT INTO member_locations (user_id, group_id, latitude, longitude, accuracy)
VALUES (:'alice', :'g_work', 55.7000, 12.6000, 10);

SELECT test.check(
  'member_locations: one position per group, not one per user',
  (SELECT count(*)::text FROM member_locations WHERE user_id = :'alice'),
  '2'
);

SELECT test.check(
  'member_locations: still exactly one position in the original group',
  (
    SELECT count(*)::text FROM member_locations
    WHERE user_id = :'alice' AND group_id = :'g_family'
  ),
  '1'
);

-- ===========================================================================
-- 5. There is no history table to write to
-- ===========================================================================
-- If someone adds one, this fails and the privacy contract has to be revisited
-- in the same change.
SELECT test.check(
  'schema: no table looks like a location history',
  (
    SELECT count(*)::text
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (
        table_name ILIKE '%location%history%'
        OR table_name ILIKE '%location%log%'
        OR table_name ILIKE '%location_track%'
        OR table_name ILIKE '%breadcrumb%'
      )
  ),
  '0'
);

-- ===========================================================================
-- 6. A background write still cannot reach a group the user is not in
-- ===========================================================================
-- The background task writes with the user's own credentials, so the Ward 3.2
-- membership check applies to it exactly as it does to a foreground write.
SELECT test.check(
  'member_locations: bob cannot write into a group he is not a member of',
  test.execute_as(:'bob', format(
    'INSERT INTO member_locations (user_id, group_id, latitude, longitude, accuracy)
     VALUES (%L, %L, 1, 1, 1)', :'bob', :'g_work')),
  'ERR:42501'
);

\o

SELECT test.finish();

ROLLBACK;
