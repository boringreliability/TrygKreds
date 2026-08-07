-- ============================================================================
-- Ward 3.2 -- RLS hardening
-- ============================================================================
--
-- Fixes three classes of defect in the Ward 2 / Ward 3 policies, all verified by
-- supabase/tests/02_rls_test.sql:
--
--   1. Infinite recursion. The SELECT policy on group_members contained a
--      subquery against group_members, so evaluating the policy re-entered the
--      policy. Postgres aborts such queries with 42P17. Because the policies on
--      groups, member_locations and location_sharing_settings all joined to
--      group_members as well, every read path in the app raised instead of
--      returning rows.
--
--   2. Views bypassing RLS. groups_with_member_count and
--      member_locations_with_sharing were created without security_invoker, so
--      they ran with the view owner's rights and ignored every policy on the
--      tables underneath. A member of one group could read the stored positions
--      of users they share no group with. For an app whose only reason to exist
--      is privacy, this was the most serious defect present.
--
--   3. Permanent invite codes. A code could not expire, could not be revoked,
--      and rotation was a plain UPDATE from the client. A code left in an old
--      SMS granted access forever.
--
-- It also closes two write-path holes found while testing (see section 3).
-- ============================================================================


-- ===========================================================================
-- 1. Break the recursion
-- ===========================================================================
--
-- A SECURITY DEFINER function is the standard way out: it runs as its owner, so
-- reading group_members inside it does not re-enter the policy on
-- group_members. It is safe to expose because it answers exactly one question
-- -- "is the *calling* user in this group?" -- and never reveals anything about
-- anyone else. auth.uid() is resolved inside the function, so a caller cannot
-- ask on another user's behalf.
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_group_member(uuid) IS
  'True when the calling user is a member of the given group. SECURITY DEFINER '
  'so that policies on group_members can use it without recursing. Only ever '
  'reports on the caller''s own membership.';


-- ===========================================================================
-- 2. Rewrite every policy that joined to group_members
-- ===========================================================================

-- --- groups -----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their groups" ON groups;
CREATE POLICY "Users can view their groups"
  ON groups FOR SELECT
  USING (public.is_group_member(id));

-- --- group_members ----------------------------------------------------------
DROP POLICY IF EXISTS "Users can view group members" ON group_members;
CREATE POLICY "Users can view group members"
  ON group_members FOR SELECT
  USING (public.is_group_member(group_id));

-- --- member_locations -------------------------------------------------------
DROP POLICY IF EXISTS "Users can view group member locations" ON member_locations;
CREATE POLICY "Users can view group member locations"
  ON member_locations FOR SELECT
  USING (
    -- Your own row is always yours to read, including while you are not
    -- sharing, so the app can show and delete what it holds about you.
    user_id = auth.uid()
    OR (
      public.is_group_member(group_id)
      AND EXISTS (
        SELECT 1 FROM location_sharing_settings lss
        WHERE lss.user_id = member_locations.user_id
          AND lss.group_id = member_locations.group_id
          AND lss.sharing_enabled = true
      )
    )
  );

-- --- location_sharing_settings ---------------------------------------------
-- Ward 3 shipped two SELECT policies here. Policies are OR'ed, so the narrower
-- one ("your own rows") was fully subsumed by the broader one and served only
-- to obscure the effective rule. Collapsed into a single policy -- but note the
-- own-rows branch is still needed: settings can outlive membership in a group
-- you have left, and you must still be able to read your own.
DROP POLICY IF EXISTS "Users can view their sharing settings" ON location_sharing_settings;
DROP POLICY IF EXISTS "Users can view group members sharing status" ON location_sharing_settings;
CREATE POLICY "Users can view sharing settings"
  ON location_sharing_settings FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_group_member(group_id)
  );


-- ===========================================================================
-- 3. Close the write-path holes
-- ===========================================================================
--
-- The Ward 2/3 write policies checked only `user_id = auth.uid()` -- that the
-- row is about you -- but never that you belong to the group it points at. Any
-- authenticated user who learned or guessed a group UUID could therefore write
-- their position into a stranger's group, or enrol themselves as a member of
-- it. Membership is now the gate on both.

-- Joining is no longer a client-side INSERT. It happens only through
-- join_group_by_invite_code() below, which validates the code, its expiry and
-- its revocation before enrolling anyone.
DROP POLICY IF EXISTS "Users can join groups" ON group_members;

-- The owner still has to be enrolled when a group is created. That runs in a
-- trigger, so it needs to work without a permissive INSERT policy: make the
-- trigger SECURITY DEFINER. It can only ever insert the owner of the row being
-- created, and the INSERT policy on `groups` already requires
-- owner_id = auth.uid().
CREATE OR REPLACE FUNCTION add_owner_as_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner');
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Users can upsert their own location" ON member_locations;
CREATE POLICY "Users can upsert their own location"
  ON member_locations FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id));

DROP POLICY IF EXISTS "Users can update their own location" ON member_locations;
CREATE POLICY "Users can update their own location"
  ON member_locations FOR UPDATE
  USING (user_id = auth.uid() AND public.is_group_member(group_id));

DROP POLICY IF EXISTS "Users can upsert their sharing settings" ON location_sharing_settings;
CREATE POLICY "Users can upsert their sharing settings"
  ON location_sharing_settings FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id));

DROP POLICY IF EXISTS "Users can update their sharing settings" ON location_sharing_settings;
CREATE POLICY "Users can update their sharing settings"
  ON location_sharing_settings FOR UPDATE
  USING (user_id = auth.uid() AND public.is_group_member(group_id));


-- ===========================================================================
-- 4. Make the views honour RLS
-- ===========================================================================
--
-- security_invoker makes a view run with the *caller's* rights, so the policies
-- on the underlying tables apply. Without it a view is a hole straight through
-- RLS. Requires PostgreSQL 15+.
ALTER VIEW groups_with_member_count      SET (security_invoker = true);
ALTER VIEW member_locations_with_sharing SET (security_invoker = true);


-- ===========================================================================
-- 5. Invite codes: expiry, revocation and rotation
-- ===========================================================================

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS invite_code_expires_at TIMESTAMPTZ
    NOT NULL DEFAULT (now() + interval '7 days'),
  ADD COLUMN IF NOT EXISTS invite_code_revoked_at TIMESTAMPTZ;

COMMENT ON COLUMN groups.invite_code_expires_at IS
  'When the current invite code stops working. Existing codes are given a '
  '7 day grace period by this migration.';
COMMENT ON COLUMN groups.invite_code_revoked_at IS
  'Set to disable the current invite code before it expires. Cleared on rotation.';

-- Raise the code from 4 to 5 random bytes (32 -> 40 bits, 8 -> 10 hex chars).
-- Redemption is now a single server-side function, which is also where any
-- future rate limiting belongs.
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT
LANGUAGE sql
VOLATILE
AS $$
  SELECT upper(encode(gen_random_bytes(5), 'hex'));
$$;

ALTER TABLE groups
  ALTER COLUMN invite_code SET DEFAULT upper(encode(gen_random_bytes(5), 'hex'));

-- ---------------------------------------------------------------------------
-- rotate_invite_code(group_id) -> the new code
--
-- Replaces the code, clears any revocation and starts a fresh expiry window.
-- Owner only. SECURITY DEFINER with an explicit owner check, so a non-owner
-- gets a hard error rather than a silent no-op (an UPDATE blocked by RLS
-- affects zero rows and reports success, which is the wrong signal here).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rotate_invite_code(p_group_id uuid)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_new_code text;
  v_attempt  integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.groups
    WHERE id = p_group_id AND owner_id = v_uid
  ) THEN
    -- Deliberately identical whether the group does not exist or the caller is
    -- not its owner: distinguishing the two would confirm a group's existence.
    RAISE EXCEPTION 'Only the group owner can rotate the invite code'
      USING ERRCODE = '42501';
  END IF;

  -- invite_code is UNIQUE, so retry on the (vanishingly rare) collision rather
  -- than failing the caller's rotation.
  LOOP
    v_attempt := v_attempt + 1;
    v_new_code := generate_invite_code();
    BEGIN
      UPDATE public.groups
         SET invite_code            = v_new_code,
             invite_code_expires_at = now() + interval '7 days',
             invite_code_revoked_at = NULL
       WHERE id = p_group_id;
      RETURN v_new_code;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- join_group_by_invite_code(code) -> the joined group's id
--
-- Redemption MUST be a function, not a client SELECT on groups. RLS cannot
-- express "readable only by someone who already knows the code": a USING clause
-- cannot see the client's WHERE predicate, so any policy permissive enough to
-- allow the lookup would also allow SELECT * over every group in the table.
-- The SELECT policy on groups therefore stays members-only, and this function
-- is the single, validated way in.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_group_by_invite_code(p_invite_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_group_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_group_id
  FROM public.groups
  WHERE invite_code = upper(trim(p_invite_code))
    AND invite_code_revoked_at IS NULL
    AND invite_code_expires_at > now();

  IF v_group_id IS NULL THEN
    -- One message for unknown, expired and revoked alike: telling them apart
    -- would let a caller probe which codes exist.
    RAISE EXCEPTION 'Invalid or expired invite code' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = v_group_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Already a member of this group' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_group_id, v_uid, 'member');

  RETURN v_group_id;
END;
$$;

-- Only end users need these; nothing else should be able to call them.
REVOKE ALL ON FUNCTION public.rotate_invite_code(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_group_by_invite_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_invite_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_group_by_invite_code(text) TO authenticated;
