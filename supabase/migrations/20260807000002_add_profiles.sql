-- ============================================================================
-- Ward 3.3 -- profiles and display names
-- ============================================================================
--
-- Until now there was nothing to label a member with. group_members holds only
-- a user_id, and auth.users is not readable from the client, so the map showed
-- every member as "Member".
--
-- A display_name is user-chosen and need not be a real name.
--
-- No email column. profiles is readable by everyone you share a group with, so
-- an email here would hand your address to every member of every group you
-- join. The address already lives in auth.users, which clients cannot read.
-- ============================================================================

CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULL until the user picks one. The app shows a neutral placeholder rather
  -- than inventing a name or falling back to the user id.
  display_name TEXT
    CONSTRAINT display_name_length CHECK (
      display_name IS NULL
      OR char_length(trim(display_name)) BETWEEN 1 AND 40
    ),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE profiles IS
  'User-chosen display names. Readable by anyone you share a group with, so it '
  'deliberately holds nothing but a name -- no email, no contact details.';

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ===========================================================================
-- A profile exists for every account, always
-- ===========================================================================
--
-- SECURITY DEFINER because this runs as part of signup, where there is no
-- authenticated caller yet for an RLS policy to authorise.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill accounts that predate this migration, so no existing user is left
-- without a profile row for the app to write to.
INSERT INTO profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;


-- ===========================================================================
-- Who may see a profile
-- ===========================================================================
--
-- The rule is "people you share at least one group with". is_group_member()
-- cannot express that on its own: it answers a question about a *group*, and
-- profiles carries no group_id. So this is its companion -- same shape, same
-- reason for being SECURITY DEFINER (reading group_members from inside a policy
-- on another table would otherwise be subject to that table's own policy), and
-- the same guarantee: it resolves auth.uid() internally, so a caller can only
-- ever ask "do I share a group with this person?" and never about two third
-- parties.
CREATE OR REPLACE FUNCTION public.shares_group_with(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members AS mine
    JOIN public.group_members AS theirs USING (group_id)
    WHERE mine.user_id = auth.uid()
      AND theirs.user_id = p_user_id
  );
$$;

COMMENT ON FUNCTION public.shares_group_with(uuid) IS
  'True when the calling user and the given user are members of at least one '
  'group in common. SECURITY DEFINER; only ever reports on the caller''s own '
  'shared memberships.';

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view profiles of people they share a group with" ON profiles;
CREATE POLICY "Users can view profiles of people they share a group with"
  ON profiles FOR SELECT
  USING (
    id = auth.uid()
    OR public.shares_group_with(id)
  );

-- Only your own name is yours to change. Omitting WITH CHECK means the USING
-- expression is applied to the new row too, so a caller cannot re-point a row
-- at another user's id.
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- The trigger above normally creates the row. This policy exists so the app can
-- upsert safely and self-heal a missing row, without letting anyone forge a
-- profile for another account.
DROP POLICY IF EXISTS "Users can create their own profile" ON profiles;
CREATE POLICY "Users can create their own profile"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- No DELETE policy: a profile's lifetime follows its account, via the
-- ON DELETE CASCADE above.
