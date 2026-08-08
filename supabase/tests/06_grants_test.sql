-- ============================================================================
-- Ward 6.2 -- grant hygiene
-- ============================================================================
--
-- These assertions ask the catalogue rather than calling anything. Calling
-- cannot tell the two outcomes apart: without EXECUTE, PostgreSQL raises 42501;
-- with EXECUTE, the function itself raises 'Not authenticated' USING ERRCODE =
-- '42501'. Same SQLSTATE, opposite meaning. A call-based test here would pass
-- whether or not the hole was closed.
--
-- No fixture rows are needed -- privileges are schema state, not data.
-- ============================================================================

BEGIN;

\o /dev/null

-- --- the six functions meant for signed-in users only ----------------------

SELECT test.check(
  'grants: anon cannot execute is_group_member',
  has_function_privilege('anon', 'public.is_group_member(uuid)', 'EXECUTE')::text,
  'false'
);

SELECT test.check(
  'grants: anon cannot execute shares_group_with',
  has_function_privilege('anon', 'public.shares_group_with(uuid)', 'EXECUTE')::text,
  'false'
);

SELECT test.check(
  'grants: anon cannot execute join_group_by_invite_code',
  has_function_privilege('anon', 'public.join_group_by_invite_code(text)', 'EXECUTE')::text,
  'false'
);

SELECT test.check(
  'grants: anon cannot execute rotate_invite_code',
  has_function_privilege('anon', 'public.rotate_invite_code(uuid)', 'EXECUTE')::text,
  'false'
);

SELECT test.check(
  'grants: anon cannot execute register_push_token',
  has_function_privilege('anon', 'public.register_push_token(text, text)', 'EXECUTE')::text,
  'false'
);

SELECT test.check(
  'grants: anon cannot execute remove_my_push_token',
  has_function_privilege('anon', 'public.remove_my_push_token(text)', 'EXECUTE')::text,
  'false'
);

-- --- authenticated keeps what it needs -------------------------------------
-- Guards against over-correction: revoking too broadly would break the app
-- without any assertion noticing.

SELECT test.check(
  'grants: authenticated can still execute join_group_by_invite_code',
  has_function_privilege('authenticated', 'public.join_group_by_invite_code(text)', 'EXECUTE')::text,
  'true'
);

SELECT test.check(
  'grants: authenticated can still execute register_push_token',
  has_function_privilege('authenticated', 'public.register_push_token(text, text)', 'EXECUTE')::text,
  'true'
);

-- --- trigger functions are not API -----------------------------------------

SELECT test.check(
  'grants: anon cannot execute add_owner_as_member',
  has_function_privilege('anon', 'public.add_owner_as_member()', 'EXECUTE')::text,
  'false'
);

SELECT test.check(
  'grants: authenticated cannot execute add_owner_as_member',
  has_function_privilege('authenticated', 'public.add_owner_as_member()', 'EXECUTE')::text,
  'false'
);

SELECT test.check(
  'grants: anon cannot execute handle_new_user',
  has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')::text,
  'false'
);

SELECT test.check(
  'grants: authenticated cannot execute handle_new_user',
  has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE')::text,
  'false'
);

-- --- anon holds nothing on any table or view -------------------------------
-- has_table_privilege, not information_schema.role_table_grants. A PUBLIC
-- grant shows up there under the grantee 'PUBLIC', so a query filtered on
-- 'anon' reports zero while anon can still read the table -- which is this
-- ward's own bug, in the assertion meant to enforce this ward's rule.
-- has_table_privilege resolves access however it is reached.
SELECT test.check(
  'grants: anon holds no privilege on any table or view in public',
  (
    SELECT count(*)::text
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind IN ('r', 'v', 'm', 'p')
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = c.oid
          AND d.deptype = 'e'
      )
      AND has_table_privilege(
            'anon', c.oid,
            'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
          )
  ),
  '0'
);

-- --- every function WE define pins its search_path -------------------------
-- Written as "how many do not" rather than naming the two that were wrong,
-- so the assertion keeps covering functions added later.
--
-- Extension-owned functions are excluded. The shim installs pgcrypto into
-- public, which puts ~36 functions there that are not ours to configure. On
-- the real project pgcrypto lives in the `extensions` schema, so counting
-- them would be asserting against a quirk of the harness -- exactly the kind
-- of harness-versus-production divergence this ward exists to remove.
SELECT test.check(
  'grants: every function we define pins search_path',
  (
    SELECT count(*)::text
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      -- Procedures (prokind = 'p') are excluded: PostgREST does not expose
      -- them, so they carry no anon-reachability risk this suite cares about.
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid
          AND d.deptype = 'e'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(coalesce(p.proconfig, '{}'::text[])) AS c
        WHERE c LIKE 'search_path=%'
      )
  ),
  '0'
);

-- --- and nothing outside the eight named above ----------------------------
-- The assertions above name each function. This one asks the same question
-- of every function we define, so a new one that leaks is caught by the
-- suite rather than by an advisor months later. has_function_privilege
-- resolves access through PUBLIC as well as through named grants, which is
-- what makes it the right question.
--
-- Verified to fire: a `public.leak_probe()` function was temporarily inserted
-- immediately above this assertion (after every migration runs, matching how
-- a real leaked function would arrive) and this assertion reported
-- "expected 0, got 1" before the probe was removed and the suite returned to
-- 111 of 111.
SELECT test.check(
  'grants: anon can execute none of the functions we define',
  (
    SELECT count(*)::text
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      -- Procedures (prokind = 'p') are excluded: PostgREST does not expose
      -- them, so they carry no anon-reachability risk this suite cares about.
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid
          AND d.deptype = 'e'
      )
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  '0'
);

-- --- what a new function actually gets, recorded on purpose ---------------
-- This asserts something we do NOT want, and that is deliberate. It pins
-- PostgreSQL's behaviour in place: a function created without an explicit
-- revoke IS reachable by anon, because the built-in default grants EXECUTE
-- to PUBLIC and no ALTER DEFAULT PRIVILEGES can take that away.
--
-- It exists so nobody spends another afternoon trying to prevent this in
-- the migration, and so that if a future PostgreSQL ever does make it
-- preventable, this assertion goes red and tells us. The assertion above is
-- what actually protects the app.
CREATE FUNCTION public.ward_6_2_probe()
RETURNS integer
LANGUAGE sql
SET search_path = public
AS $$ SELECT 1 $$;

SELECT test.check(
  'grants: a new function is anon-reachable until its author revokes PUBLIC',
  has_function_privilege('anon', 'public.ward_6_2_probe()', 'EXECUTE')::text,
  'true'
);

\o

SELECT test.finish();

ROLLBACK;
