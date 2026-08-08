-- ============================================================================
-- Ward 6.2 -- an unauthenticated caller can do nothing
-- ============================================================================
--
-- The earlier migrations end with REVOKE ALL ... FROM PUBLIC and a comment
-- saying nothing else should be able to call these functions. On Supabase that
-- is not what happened: default privileges grant EXECUTE directly to `anon` by
-- name, and revoking from PUBLIC leaves a named grant untouched. Checked
-- against pg_proc.proacl on the live project, `anon` held EXECUTE on all of
-- them.
--
-- Nothing leaked, because each function refuses a NULL auth.uid() itself. This
-- closes the layer that was supposed to hold.
--
-- `anon` loses nothing real: sign-up and sign-in go through GoTrue, not
-- PostgREST, and everything TrygKreds does requires a signed-in user.
-- ============================================================================


-- ===========================================================================
-- 1. Take away what anon already has
-- ===========================================================================
--
-- USAGE ON SCHEMA public is deliberately left in place. The rule is "no
-- privilege on any table, view or function"; removing schema usage as well
-- turns clean permission errors into resolution failures and buys nothing once
-- no object privileges remain.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES  IN SCHEMA public FROM anon;

-- Revoking from `anon` by name is not enough on its own. Only four functions
-- were ever revoked from PUBLIC -- join_group_by_invite_code,
-- rotate_invite_code, register_push_token and remove_my_push_token. The rest
-- still carry PostgreSQL's default EXECUTE to PUBLIC, and a role reaches a
-- function through PUBLIC as readily as through a grant of its own. Without
-- this line, `anon` keeps access to is_group_member and shares_group_with no
-- matter what is revoked from it by name.
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;

-- Which immediately takes something away that the app needs. is_group_member
-- and shares_group_with were never granted to `authenticated` either -- they
-- relied on PUBLIC too. Every RLS policy calls one of them, and a policy
-- expression is evaluated as the querying user, so without EXECUTE every read
-- path fails. Granting them explicitly is what makes the revoke above safe.
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_group_with(uuid) TO authenticated;


-- ===========================================================================
-- 2. And what it would otherwise be given next time
-- ===========================================================================
--
-- Without this, the next CREATE FUNCTION hands anon EXECUTE again and the hole
-- reopens silently. ALTER DEFAULT PRIVILEGES applies to objects created by the
-- role that runs it, which is the role that runs migrations -- the same role in
-- both the test harness and the live project.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES  FROM anon;

-- There is deliberately no `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON
-- FUNCTIONS FROM PUBLIC` here, though it looks like the obvious next line.
-- It does nothing. The stored default ACL is a delta on top of PostgreSQL's
-- built-in default rather than a replacement for it, so PUBLIC is never in
-- the stored ACL and a REVOKE has nothing to remove. Verified by replaying
-- this sequence and inspecting pg_default_acl: after the revoke the stored
-- ACL was unchanged and the next function created still carried `=X/owner`,
-- which is the PUBLIC grant.
--
-- So a function added later IS reachable by anon until whoever adds it
-- revokes PUBLIC and grants explicitly, the way the four functions in the
-- earlier migrations do. What stops that from going unnoticed is
-- supabase/tests/06_grants_test.sql, which fails the build if any function
-- we define is reachable by anon. Detection, not prevention -- the same
-- shape as scripts/check-dependencies.js and scripts/check-network-access.js.


-- ===========================================================================
-- 3. Trigger functions are not API
-- ===========================================================================
--
-- add_owner_as_member fires from a trigger on groups; handle_new_user from one
-- on auth.users. PostgreSQL checks EXECUTE when the trigger is created, not
-- each time it fires, so removing the privilege does not stop them working --
-- it only removes two endpoints from the REST surface that nobody should be
-- calling. Group creation in 02_rls_test.sql is what proves this.
REVOKE ALL ON FUNCTION public.add_owner_as_member() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user()     FROM PUBLIC, anon, authenticated;


-- ===========================================================================
-- 4. Pin the two search_paths that were left mutable
-- ===========================================================================
--
-- Every other function in this schema sets it. These two predate the habit.
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.generate_invite_code()     SET search_path = public;
