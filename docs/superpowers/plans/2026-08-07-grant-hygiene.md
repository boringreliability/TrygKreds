# Ward 6.2 — Grant Hygiene and Shim Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap where `anon` can execute functions the migrations intended for signed-in users only, and fix the test harness that reported green on that guarantee for as long as it existed.

**Architecture:** The harness is corrected first, so the new assertions go red for the right reason; only then is the migration written to make them green. Afterwards the change is applied to the live project and checked against the database itself, because the harness is a model and this ward exists because a model lied.

**Tech Stack:** PostgreSQL 15+ (the live project runs 17.6), the repository's own tiny assertion harness in `supabase/tests/01_test_helpers.sql` (pgTAP is deliberately not used), `psql`, and the Supabase MCP server for reaching the live project.

## Global Constraints

- **Never call a function to test whether a role may call it.** Without `EXECUTE`, PostgreSQL raises `42501`. With `EXECUTE`, these functions raise `'Not authenticated'` `USING ERRCODE = '42501'`. Identical SQLSTATE, opposite meaning. Ask the catalogue instead: `has_function_privilege`, `has_table_privilege`, `information_schema.role_table_grants`.
- **`anon` keeps `USAGE ON SCHEMA public`.** The rule is "no privilege on any table, view or function". Removing schema usage as well turns clean permission errors into resolution failures, and buys nothing once no object privileges remain.
- **`supabase/tests/*.sql` are never migrations.** They must not be copied into `supabase/migrations/`. Both files say so at the top; keep it that way.
- **Each `*_test.sql` file wraps itself in `BEGIN;` … `ROLLBACK;`** so files are independent and leave no fixture behind.
- **Output pattern:** `\o /dev/null` after `BEGIN;`, `\o` again immediately before `SELECT test.finish();`. Assertion results arrive as INFO/WARNING notices, not as query output.
- **The test runner applies files in this order:** `00_supabase_shim.sql`, then every migration in lexical order, then `01_test_helpers.sql`, then every `*_test.sql` in lexical order.
- **Conventional commits.** Prettier covers `**/*.{ts,tsx,js,jsx,json,md}` — not `.sql`, not `.feature`.
- **PRIVACY.md is not updated.** What is stored, who can read it and how long it is kept are unchanged.

---

## File Structure

| File                                                    | Responsibility                                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `supabase/tests/00_supabase_shim.sql`                   | Modified. Gains the default privileges on `FUNCTIONS` and the `anon` table grants that Supabase really applies, so the harness stops being optimistic. |
| `supabase/tests/06_grants_test.sql`                     | Created. Asserts the grant rules by asking the catalogue.                                                                                              |
| `supabase/migrations/20260807000004_lock_down_anon.sql` | Created. Revokes everything from `anon`, seals the two trigger functions, sets default privileges, pins `search_path` on the two functions missing it. |
| `specs/ward-6-2-grant-hygiene.feature`                  | Created. The Gherkin.                                                                                                                                  |

No file is split or restructured. `00_supabase_shim.sql` is 88 lines and gains roughly ten more; it stays one file because it has one job.

---

## Task 1: Make the harness resemble production, and prove the gap

Ends with a **red** suite. That is the deliverable: it is the first time the harness can see this class of defect at all.

**Files:**

- Create: `specs/ward-6-2-grant-hygiene.feature`
- Create: `supabase/tests/06_grants_test.sql`
- Modify: `supabase/tests/00_supabase_shim.sql`

**Interfaces:**

- Consumes: `test.check(description text, actual text, expected text)` and `test.finish()` from `supabase/tests/01_test_helpers.sql`.
- Produces: nothing later tasks import. Task 2 makes these same assertions pass.

- [ ] **Step 1: Write the feature file**

Create `specs/ward-6-2-grant-hygiene.feature`:

```gherkin
Feature: An unauthenticated caller can do nothing
  In order to mean what the migrations say
  As the maintainer of a privacy-first app
  I want the grants in the database to match the intent written above them

  # The migrations revoke EXECUTE from PUBLIC and grant it to authenticated,
  # under the comment "nothing else should be able to call them". On Supabase
  # that is not what happens: default privileges grant EXECUTE directly to the
  # anon role, and revoking from PUBLIC does not touch a named grant.
  #
  # Nothing leaks today, because every one of those functions refuses a NULL
  # auth.uid() itself. This is about the layer that was supposed to hold.
  #
  # Verified by: supabase/tests/06_grants_test.sql.

  Scenario: An unauthenticated caller cannot execute any of our functions
    Given the anon role
    Then it should hold no EXECUTE privilege on any function in public

  Scenario: Trigger functions are not part of the API surface
    # add_owner_as_member and handle_new_user run from triggers. Exposing them
    # as RPC endpoints gives callers something to poke at for no benefit.
    Given the trigger functions add_owner_as_member and handle_new_user
    Then no end-user role should be able to execute them

  Scenario: An unauthenticated caller holds nothing on any table
    Given the anon role
    Then it should hold no privilege on any table or view in public

  Scenario: Every function pins its search_path
    # A mutable search_path in a function is a way in. Most of ours set it
    # already; two did not.
    Given every function in the public schema
    Then each should have search_path set explicitly

  Scenario: The rule survives the next function someone adds
    # Without default privileges, the next CREATE FUNCTION hands anon EXECUTE
    # again and nobody notices until an advisor is run months later.
    Given a new function is created in public after this migration
    Then anon should not receive EXECUTE on it

  Scenario: The harness tells the truth about grants
    # This is the reason the ward exists. Before this change the harness gave
    # anon nothing, so "anon cannot call X" passed without anything being
    # fixed -- a test that could not go red for the right reason.
    Given the test harness
    Then it should grant anon exactly what Supabase grants it
```

- [ ] **Step 2: Write the assertions**

Create `supabase/tests/06_grants_test.sql`:

```sql
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

SELECT test.check(
  'grants: anon holds no privilege on any table or view in public',
  (
    SELECT count(*)::text
    FROM information_schema.role_table_grants
    WHERE grantee = 'anon'
      AND table_schema = 'public'
  ),
  '0'
);

-- --- every function pins its search_path -----------------------------------
-- Written as "how many do not" rather than naming the two that were wrong, so
-- the assertion keeps covering functions added later.

SELECT test.check(
  'grants: every function in public pins search_path',
  (
    SELECT count(*)::text
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(coalesce(p.proconfig, '{}'::text[])) AS c
        WHERE c LIKE 'search_path=%'
      )
  ),
  '0'
);

\o

SELECT test.finish();

ROLLBACK;
```

- [ ] **Step 3: Run the suite and see which assertions pass for the WRONG reason**

Run:

```bash
npm run test:rls 2>&1 | tail -30
```

Expected: a **mixed** result, and the mix is the point.

**Passing, but vacuously — this is the defect, reproduced:** every `anon cannot execute …` assertion, and `anon holds no privilege on any table or view`. The harness currently gives `anon` nothing at all, so these are true without anything having been fixed. On the live project the same statements are false.

**Already failing, correctly:**

- `authenticated cannot execute add_owner_as_member` and the same for `handle_new_user`. Those two functions still carry PostgreSQL's own default `EXECUTE` to `PUBLIC`, and `has_function_privilege` resolves a role's access through `PUBLIC`. Task 2 revokes it.
- `every function in public pins search_path`, which reports `2` — `update_updated_at_column` and `generate_invite_code`. Task 2 pins them.

Record this output. The contrast between the two groups after Step 5 is the evidence that the harness change did something.

- [ ] **Step 4: Make the harness resemble production**

In `supabase/tests/00_supabase_shim.sql`, replace the whole final block — from the `-- Privileges on the public schema.` comment to the end of the file — with:

```sql
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
```

- [ ] **Step 5: Run the suite and confirm it is now RED for the right reason**

Run:

```bash
npm run test:rls 2>&1 | tail -40
```

Expected: **more failures than in Step 3**, and specifically these, which were passing five minutes ago:

- every `anon cannot execute …` assertion, now reporting `expected false, got true`
- `anon holds no privilege on any table or view in public`, now reporting a non-zero count

Nothing about the database changed between Step 3 and Step 5 — only the model did. That flip is the whole point of the ward: these assertions were never measuring anything.

The two trigger-function assertions and the `search_path` assertion stay red from Step 3. Task 2 turns all of them green together.

If the older suites (`02_rls_test.sql` through `05_sos_test.sql`) also fail now, read those failures before continuing. Granting `anon` table privileges may have exposed a second, separate gap in the policies, and that is worth knowing about rather than papering over.

- [ ] **Step 6: Do not commit**

The repository is deliberately red between Task 1 and Task 2. Committing here would leave `main` broken. Task 2 commits both together.

---

## Task 2: Close the hole

**Files:**

- Create: `supabase/migrations/20260807000004_lock_down_anon.sql`

**Interfaces:**

- Consumes: the assertions from Task 1.
- Produces: the migration file that Task 3 applies to the live project, by that exact filename.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260807000004_lock_down_anon.sql`:

```sql
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
```

- [ ] **Step 2: Run the suite and confirm it is green**

Run:

```bash
npm run test:rls 2>&1 | tail -20
```

Expected: every assertion passes, and the count has grown by the 14 assertions added in Task 1.

Pay attention to `02_rls_test.sql` in particular: it creates groups, which fires `add_owner_as_member`. If that suite still passes, the trigger revoke in section 3 is safe.

- [ ] **Step 3: Break it on purpose and confirm the suite notices**

Temporarily comment out the three `REVOKE ALL ... FROM anon` lines in section 1 of the migration, then run:

```bash
npm run test:rls 2>&1 | tail -20
```

Expected: FAIL, naming the `anon cannot execute …` assertions.

This is the project's standing discipline: a guard that has not been seen failing has not been tested. Restore the lines afterwards and re-run to confirm green again.

- [ ] **Step 4: Commit Task 1 and Task 2 together**

```bash
git add specs/ward-6-2-grant-hygiene.feature supabase/tests/06_grants_test.sql supabase/tests/00_supabase_shim.sql supabase/migrations/20260807000004_lock_down_anon.sql
git commit -m "fix(security): an unauthenticated caller can do nothing

The migrations revoked EXECUTE from PUBLIC and granted it to
authenticated, under the comment that nothing else should be able to call
them. On Supabase that is not what happens: default privileges grant
EXECUTE directly to anon by name, and revoking from PUBLIC leaves a named
grant untouched. On the live project anon held EXECUTE on every one of
them.

Nothing leaked -- each function refuses a NULL auth.uid() itself. This
closes the layer that was supposed to hold, and sets default privileges so
the next function added does not reopen it.

The harness is fixed first and separately, because it is the reason nobody
noticed. 00_supabase_shim.sql set default privileges on TABLES and
SEQUENCES but not on FUNCTIONS, and gave anon nothing. So a new function
got only Postgres's own EXECUTE-to-PUBLIC, the revoke removed it entirely,
and anon ended up unable to call anything -- exactly the answer we wanted
to be true. The harness was not blind, it was optimistic, which is worse:
it looked like evidence.

The new assertions ask the catalogue rather than calling anything. A
call-based test cannot tell the two cases apart: without EXECUTE Postgres
raises 42501, and with EXECUTE these functions raise 'Not authenticated'
USING ERRCODE = '42501'.

Also pins search_path on update_updated_at_column and generate_invite_code,
the only two functions in the schema that lacked it."
```

---

## Task 3: Apply it to the live project and check the model against reality

The harness is a model, and this ward exists because a model lied. Green here proves the model agrees with itself, not with Supabase.

**Files:** none.

**Interfaces:**

- Consumes: `supabase/migrations/20260807000004_lock_down_anon.sql` from Task 2.
- Produces: the migration applied to project `ywbyfbmllklvmmpstvcu`.

- [ ] **Step 1: Apply the migration through the MCP server**

Use the Supabase MCP tool `apply_migration` with `name` set to `lock_down_anon` and `query` set to the full contents of `supabase/migrations/20260807000004_lock_down_anon.sql`.

Do not try `supabase db push` or `psql`. Every Postgres-protocol route off this machine is closed: `db.ywbyfbmllklvmmpstvcu.supabase.co` has no A record and the machine has no outbound IPv6, while the IPv4 pooler refuses 5432 and 6543. Only HTTPS leaves, which is what the MCP server uses.

- [ ] **Step 2: Ask the live database directly**

Use the MCP tool `execute_sql` with:

```sql
SELECT p.proname AS fn,
       pg_get_userbyid(a.grantee) AS grantee,
       a.privilege_type
FROM pg_proc p
CROSS JOIN LATERAL aclexplode(p.proacl) a
WHERE p.pronamespace = 'public'::regnamespace
  AND pg_get_userbyid(a.grantee) = 'anon'
ORDER BY p.proname;
```

Expected: **no rows.** Before this ward the same query returned `anon` with `EXECUTE` on all eight functions.

- [ ] **Step 3: Confirm authenticated kept what it needs**

Use `execute_sql` with:

```sql
SELECT has_function_privilege('authenticated', 'public.join_group_by_invite_code(text)', 'EXECUTE') AS join_ok,
       has_function_privilege('authenticated', 'public.register_push_token(text, text)', 'EXECUTE') AS push_ok,
       has_function_privilege('authenticated', 'public.add_owner_as_member()', 'EXECUTE') AS trigger_sealed;
```

Expected: `join_ok` true, `push_ok` true, `trigger_sealed` false.

- [ ] **Step 4: Re-run the advisor**

Use the MCP tool `get_advisors` with `type` set to `security`.

Expected: the `anon_security_definer_function_executable` and `function_search_path_mutable` findings are gone. Two are expected to remain and are correct:

- `rls_enabled_no_policy` on `push_tokens` (INFO) — intentional and documented in the Ward 5 migration: the table is sealed, with no policies and no end-user grants.
- `authenticated_security_definer_function_executable` on the six user-facing functions (WARN) — also intentional. They are `SECURITY DEFINER` precisely so signed-in users can call them; each resolves `auth.uid()` internally and can only act on the caller.

Record which findings remain and why, so the next person running the advisor does not re-investigate them.

- [ ] **Step 5: Nothing to commit**

This task changes the live project, not the repository.

---

## Task 4: Repair the migration history

Created earlier the same evening: the live history carries timestamps `apply_migration` invented, not the repository's filenames.

**Files:** none.

**Interfaces:**

- Consumes: the applied migration from Task 3.
- Produces: a migration history whose versions match `supabase/migrations/*.sql`.

- [ ] **Step 1: See the mismatch**

Use the MCP tool `list_migrations`.

Expected: six rows whose `name` values are `create_groups`, `create_locations`, `harden_rls`, `add_profiles`, `add_sos`, `lock_down_anon`, and whose `version` values are invented timestamps such as `20260807202939` — not the repository's `20231123000001`, `20231123000002`, `20260807000001`, `20260807000002`, `20260807000003`, `20260807000004`.

Left alone, a future `supabase db push` treats all six as unapplied and re-runs them. It would not fail cleanly: `CREATE POLICY "Users can create groups"` in the first migration has no `DROP POLICY IF EXISTS` before it, so a re-run dies partway through.

- [ ] **Step 2: Rewrite the versions**

Use the MCP tool `execute_sql` with:

```sql
UPDATE supabase_migrations.schema_migrations SET version = '20231123000001' WHERE name = 'create_groups';
UPDATE supabase_migrations.schema_migrations SET version = '20231123000002' WHERE name = 'create_locations';
UPDATE supabase_migrations.schema_migrations SET version = '20260807000001' WHERE name = 'harden_rls';
UPDATE supabase_migrations.schema_migrations SET version = '20260807000002' WHERE name = 'add_profiles';
UPDATE supabase_migrations.schema_migrations SET version = '20260807000003' WHERE name = 'add_sos';
UPDATE supabase_migrations.schema_migrations SET version = '20260807000004' WHERE name = 'lock_down_anon';
```

`version` is the primary key. The new values are all lower than the old ones and none collide, so the updates apply cleanly in this order.

- [ ] **Step 3: Confirm the two now agree**

Use `list_migrations` again.

Expected: six rows carrying exactly `20231123000001`, `20231123000002`, `20260807000001`, `20260807000002`, `20260807000003`, `20260807000004` — the repository's filenames.

Cross-check against the repository:

```bash
ls supabase/migrations/
```

The five original filenames plus `20260807000004_lock_down_anon.sql`, matching one for one.

- [ ] **Step 4: Record what was done**

Append to `.claude/CLAUDE.md`, under the "Not yet verified" section, a line stating that the schema is applied to a live Supabase project and that the migration history there was repaired by hand after the migrations went in through the Management API rather than `db push`.

Commit:

```bash
git add .claude/CLAUDE.md
git commit -m "docs(claude): record the live project and its repaired history

The schema is applied to a real Supabase project. The migrations went in
through the Management API, because every Postgres-protocol route off this
machine is closed -- the direct host is IPv6-only and the machine has no
IPv6, while the IPv4 pooler refuses 5432 and 6543.

apply_migration invents its own version timestamps, so the history did not
match the repository's filenames and a future db push would have re-run all
of them. The versions were rewritten by hand to match."
```

---

## Out of scope

The auth deep-link gap — no `emailRedirectTo`, no deep-link handler in the app, and the project's Site URL still `http://localhost:3000`, so a phone-only user strands after confirming their address — is real and was found in the same session. It is an app-layer concern with a different test harness and a different failure mode, and gets its own ward.
