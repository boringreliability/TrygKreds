-- ============================================================================
-- Ward 5 -- SOS events and push tokens
-- ============================================================================
--
-- Two tables with deliberately opposite visibility rules.
--
-- sos_events is readable by the group: an alert nobody can see is not an alert.
-- It is also the one place in TrygKreds where a position is kept beyond the
-- latest one. That is a real amendment to the privacy contract rather than an
-- exception hidden in the code -- an emergency record that vanishes is useless --
-- and PRIVACY.md states it under "What is stored".
--
-- push_tokens is write-only. A token identifies a device, and nothing needs to
-- read one except the notification function, which runs with the service role.
-- ============================================================================


-- ===========================================================================
-- sos_events
-- ===========================================================================
CREATE TABLE IF NOT EXISTS sos_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  -- Nullable on purpose. An SOS must work when location permission was refused,
  -- or when no fix is available indoors. The alert matters more than the
  -- coordinates.
  latitude   DOUBLE PRECISION CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  longitude  DOUBLE PRECISION CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  accuracy   DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE sos_events IS
  'Emergency alerts. The only place a position is retained beyond the latest '
  'one -- see PRIVACY.md. Coordinates are nullable so an SOS still works without '
  'location permission.';

CREATE INDEX IF NOT EXISTS idx_sos_events_group_id ON sos_events(group_id);
CREATE INDEX IF NOT EXISTS idx_sos_events_user_id ON sos_events(user_id);
CREATE INDEX IF NOT EXISTS idx_sos_events_created_at ON sos_events(created_at DESC);

ALTER TABLE sos_events ENABLE ROW LEVEL SECURITY;

-- Everyone in the group needs to see it. That is the entire feature.
DROP POLICY IF EXISTS "Group members can view SOS events" ON sos_events;
CREATE POLICY "Group members can view SOS events"
  ON sos_events FOR SELECT
  USING (public.is_group_member(group_id));

-- You may raise an alarm about yourself, in a group you belong to. Both halves
-- matter: without the membership check, knowing a group's UUID would be enough
-- to raise a false alarm in a stranger's family.
DROP POLICY IF EXISTS "Users can raise their own SOS" ON sos_events;
CREATE POLICY "Users can raise their own SOS"
  ON sos_events FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id));

-- The sender can delete their own event: a false alarm should not become a
-- permanent record of where they were.
DROP POLICY IF EXISTS "Users can delete their own SOS" ON sos_events;
CREATE POLICY "Users can delete their own SOS"
  ON sos_events FOR DELETE
  USING (user_id = auth.uid());

-- No UPDATE policy, deliberately. A recorded alert is a record. Being able to
-- quietly move where an SOS happened would make it worthless as one.


-- ===========================================================================
-- push_tokens -- write-only
-- ===========================================================================
CREATE TABLE IF NOT EXISTS push_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Unique on the token, not on the user: one account may have several devices,
  -- and a token identifies a single install.
  token      TEXT NOT NULL UNIQUE,
  platform   TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE push_tokens IS
  'Write-only from the client. No SELECT policy and no SELECT grant for end '
  'users: only the notification Edge Function, running as service_role, may read '
  'a token. Clients therefore re-register on every app start rather than '
  'checking what is stored.';

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);

DROP TRIGGER IF EXISTS update_push_tokens_updated_at ON push_tokens;
CREATE TRIGGER update_push_tokens_updated_at
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- No policies at all, and no privileges for end users. The table is sealed:
-- clients never touch it directly, in either direction.
--
-- Revoking SELECT is not only about reading. PostgreSQL requires the SELECT
-- privilege to evaluate `ON CONFLICT DO UPDATE` (it must read the arbiter index)
-- and to evaluate the WHERE clause of an UPDATE or DELETE. So a table a client
-- cannot read is also a table a client cannot usefully write to -- registering a
-- token has to go through a function regardless. Given that, the tightest
-- arrangement is also the simplest one: revoke everything and expose exactly two
-- operations.
REVOKE ALL ON push_tokens FROM authenticated;
REVOKE ALL ON push_tokens FROM anon;

-- Supabase's service_role is BYPASSRLS and is what the Edge Function uses. It is
-- the only thing in the system that may read a token.
GRANT SELECT ON push_tokens TO service_role;

-- ---------------------------------------------------------------------------
-- register_push_token(token, platform)
--
-- The only way a token gets stored. user_id comes from auth.uid() inside the
-- function, so a caller cannot register a token against somebody else's account
-- -- forgery is impossible by construction rather than by policy.
--
-- Idempotent: the same device re-registering refreshes the row. That is how a
-- client keeps its token current without ever reading one back, which is the
-- whole point of sealing the table.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_push_token(
  p_token text,
  p_platform text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'A push token is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.push_tokens (user_id, token, platform)
  VALUES (v_uid, trim(p_token), p_platform)
  ON CONFLICT (token) DO UPDATE
    -- A device can change hands between accounts, so the owner is re-asserted.
    SET user_id    = v_uid,
        platform   = EXCLUDED.platform,
        updated_at = now();
END;
$$;

-- ---------------------------------------------------------------------------
-- remove_my_push_token(token)
--
-- Called on sign-out, so a shared device stops receiving alerts for an account
-- that is no longer on it. Scoped to the caller: passing someone else's token
-- deletes nothing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_my_push_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.push_tokens
  WHERE user_id = v_uid
    AND token = trim(p_token);
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_token(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_my_push_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_my_push_token(text) TO authenticated;
