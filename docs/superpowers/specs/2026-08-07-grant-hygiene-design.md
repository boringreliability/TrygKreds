# Ward 6.2 — grant hygiene and shim fidelity

**Date:** 2026-08-07
**Status:** implemented and applied to the live project

## Why

The first device verification put the schema on a real Supabase project. Running
Supabase's own security advisor against it surfaced something the RLS suite had
been reporting green on for as long as it has existed.

The migrations end with:

```sql
REVOKE ALL ON FUNCTION public.join_group_by_invite_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_group_by_invite_code(text) TO authenticated;
```

under the comment _"Only end users need these; nothing else should be able to
call them."_ Checked against `pg_proc.proacl` on the live project, the `REVOKE`
did work — `PUBLIC` is gone. But `anon` still holds `EXECUTE`, because Supabase's
default privileges grant it **directly to the named role**, and revoking from
`PUBLIC` does not touch a named grant.

The stated intent and the actual state disagree, on a live project.

**Nothing leaks today.** Every one of those functions opens with
`IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'`, and
`is_group_member` / `shares_group_with` return false when `auth.uid()` is NULL.
Defence in depth holds. This ward is about the layer that was supposed to hold
and did not — and about why nothing told us.

## Why nothing told us

`supabase/tests/00_supabase_shim.sql` is a considered piece of work. It creates
`anon`, `authenticated` and `service_role`, recreates `auth.uid()`, and sets
default privileges so migrations produce reachable tables.

It sets those defaults on `TABLES` and `SEQUENCES`. Not on `FUNCTIONS`. And it
gives `anon` nothing beyond `USAGE ON SCHEMA public`.

Follow what that does to a newly created function:

| Step                           | Test harness                             | Real Supabase                                       |
| ------------------------------ | ---------------------------------------- | --------------------------------------------------- |
| After `CREATE FUNCTION`        | `EXECUTE` to `PUBLIC` (Postgres default) | `EXECUTE` to `anon` **and** `authenticated`         |
| After `REVOKE ALL FROM PUBLIC` | nobody                                   | `anon` and `authenticated` — named grants untouched |
| After `GRANT TO authenticated` | `authenticated` only                     | `anon` and `authenticated`                          |
| Can `anon` call it?            | **no**                                   | **yes**                                             |

The harness is not merely blind here. It is **optimistic**: it produces the
answer we wanted to be true. A suite reporting green on a guarantee that does not
hold in production is worse than no suite, because it looks like evidence.

## Decisions

| Question                   | Decision                                                                                                                                                                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How far to lock `anon` out | Completely — `anon` loses every privilege it holds on any table, view or function in `public`. Future functions are covered by detection rather than prevention: PostgreSQL will not let a default-privileges change take away its own built-in EXECUTE-to-PUBLIC on a new function |
| Shim fidelity              | Fix it and document the trap in the file itself. No drift-detection machinery                                                                                                                                                                                                       |
| Order of work              | Shim first, then failing assertions, then the migration                                                                                                                                                                                                                             |

`anon` loses nothing real: sign-up and sign-in go through GoTrue, not PostgREST,
and everything TrygKreds does requires a signed-in user. "An unauthenticated
caller can do nothing" is one rule, easy to hold in your head and easy to assert.

### Why the shim must be fixed first

The obvious assertion is "`anon` cannot call `join_group_by_invite_code`". Under
today's shim that passes without the migration doing anything at all, because
`anon` never had the privilege in the harness.

That is the same defect as `expect(...).toThrow()` with no matcher — a test that
cannot go red for the right reason. The same defect was found and fixed earlier
the same day, in the plan for Ward 6.1.

So the shim must **first** grant `anon` what Supabase grants it, making the
assertions red. The migration then makes them green. Reversing the order gives a
green suite that proves nothing.

## What changes

### `supabase/tests/00_supabase_shim.sql`

Add the missing default privileges on `FUNCTIONS` for `anon`, `authenticated`
and `service_role`, and the table grants to `anon` — what Supabase actually does.
Add a comment naming this specific trap: a grant missing here does not weaken the
harness, it makes the harness lie.

### `supabase/tests/06_grants_test.sql` (new)

Three questions:

- Can `anon` execute any of the six user-facing functions — `is_group_member`,
  `shares_group_with`, `join_group_by_invite_code`, `rotate_invite_code`,
  `register_push_token`, `remove_my_push_token`? Must be no.
- Can anything reach `add_owner_as_member` or `handle_new_user` through RPC?
  Must be no — they are trigger functions with no business in the API surface.
- Does `anon` hold any privilege at all on a table or view in `public`? Must be no.

### The migration (new)

- Revoke every privilege on tables, views and functions in `public` from `anon`.
- Revoke `EXECUTE` on `add_owner_as_member` and `handle_new_user` from all roles.
- `ALTER DEFAULT PRIVILEGES` removes Supabase's _named_ default grant to `anon`
  on future tables, sequences and routines.
- It cannot remove PostgreSQL's own built-in EXECUTE-to-PUBLIC on a future
  function: the stored default ACL is a delta on top of that built-in default,
  so `PUBLIC` is never in it and a `REVOKE` has nothing to take away. A
  catalogue-wide assertion is therefore the enforcement for functions added
  later, not the migration.
- `SET search_path = public` on `update_updated_at_column` and
  `generate_invite_code` — the two functions that lack it while every other one
  has it.

### `specs/ward-6-2-grant-hygiene.feature` (new)

Following the existing convention for preparatory wards.

### Migration history repair

While planning this, a second disagreement surfaced — one created tonight.

The live project's migration history reads `20260807202939`, `20260807203006`,
`20260807203041`… — timestamps `apply_migration` invented. The repository's files
are `20231123000001`, `20231123000002`, `20260807000001`… The names match; the
versions do not.

A future `supabase db push` will therefore treat all five as unapplied and try
again. It would not fail cleanly: most statements are idempotent, but
`CREATE POLICY "Users can create groups"` in the first migration has no
`DROP POLICY IF EXISTS` before it, so a re-run dies partway through on "policy
already exists".

This was caused by how the firewall was worked around: every Postgres-protocol
route off that machine is closed — the direct host is IPv6-only and the machine
has no IPv6, while the IPv4 pooler refuses 5432 and 6543 — so the migrations went
in through the Management API instead of `db push`. The mismatch is invisible and
would land on whoever runs `db push` next.

Fix: repair the five rows in `supabase_migrations.schema_migrations` so the
versions match the repository's filenames.

It belongs in this ward rather than as loose cleanup because it is the same
subject: **the database's actual state and what the repository claims must
agree.** The grant hole was one disagreement, the shim's optimism another, and
this a third.

## Verification

**In the harness, in the order that proves something.** After the shim fix and
before the migration, `npm run test:rls` must be **red** — `anon` can now
genuinely call the functions, because the harness finally resembles production.
Only then is the migration written. Afterwards, the project's own discipline:
remove the revoke on purpose and confirm the suite names the broken guarantee.

**Against the real project.** The shim is a model, and a model can lie — that is
why this ward exists. Once the migration is applied through the MCP server, query
the database directly with the `pg_proc.proacl` query that exposed the hole, and
run `get_advisors` again. The model and the reality must agree.

**Migration history.** `npx supabase migration list` must show the repository and
the database carrying the same versions.

## Out of scope

PRIVACY.md is unchanged. What is stored, who can read it, and how long it is kept
are all the same. This tightens enforcement of a rule already written there.

The auth deep-link gap — no `emailRedirectTo`, no deep-link handler, Site URL
still `http://localhost:3000` — is real and was found in the same session, but it
is an app-layer concern with a different test harness and a different failure
mode. It gets its own ward.
