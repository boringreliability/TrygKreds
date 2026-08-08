-- ============================================================================
-- Local Supabase shim -- TEST HARNESS ONLY. NOT A MIGRATION.
-- ============================================================================
--
-- RLS is database behaviour. It cannot be verified with the Jest mocks, because
-- those never touch Postgres. This file recreates just enough of Supabase's
-- contract that the real migrations in supabase/migrations/ can be applied to a
-- throwaway PostgreSQL cluster and their policies exercised for real.
--
-- What Supabase gives us in production and we recreate here:
--   * the `auth` schema and `auth.users` table that migrations reference
--   * `auth.uid()`, which reads the `sub` claim of the request JWT
--   * the `anon` / `authenticated` / `service_role` roles
--   * default privileges, so tables created by later migrations are reachable
--     by `authenticated` (Supabase does this via ALTER DEFAULT PRIVILEGES too)
--
-- This file is deliberately NOT in supabase/migrations/ -- it must never be
-- applied to a real project, where Supabase owns all of the above.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions that Supabase projects have enabled out of the box. The Ward 2
-- migration calls gen_random_bytes() for invite codes, which lives in pgcrypto.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Roles. Created NOLOGIN: tests reach them with SET ROLE, never by connecting.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    -- BYPASSRLS mirrors Supabase's service_role, which is exempt from policies.
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- auth schema
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id    UUID PRIMARY KEY,
  email TEXT UNIQUE
);

-- auth.uid() resolves the caller from the request JWT claims, exactly as
-- Supabase's does. Returns NULL when unauthenticated, so policies comparing
-- against it fail closed.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  )::uuid;
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Privileges on the public schema.
--
-- RLS only bites for roles that are neither the table owner nor a superuser,
-- so every assertion in the suite runs as `authenticated`. These default
-- privileges make the tables that later migrations create reachable by that
-- role, which is what Supabase arranges in a real project.
--
-- READ THIS BEFORE REMOVING ANYTHING BELOW.
--
-- A grant missing here does not make the harness stricter. It makes it lie.
-- Supabase grants `anon` and `authenticated` privileges DIRECTLY, by name. A
-- migration that revokes from PUBLIC therefore does not take them away. If the
-- harness never granted them in the first place, the revoke appears to work
-- here and does nothing in production -- and the suite reports green on a
-- guarantee that does not hold. That is exactly how the Ward 6.2 hole survived
-- unnoticed: `anon` held EXECUTE on every function on the live project while
-- this suite said it held none.
--
-- So these grants are not convenience. They are the part of the model that
-- makes a revoke testable.
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;

-- The line whose absence caused all of this.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
