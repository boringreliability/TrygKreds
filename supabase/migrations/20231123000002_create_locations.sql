-- Ward 3: Location sharing tables and RLS policies
-- Creates member_locations and location_sharing_settings tables

-- Member locations table (stores last known location per user per group)
CREATE TABLE IF NOT EXISTS member_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  accuracy DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, group_id)
);

-- Location sharing settings table (tracks whether sharing is enabled per user per group)
CREATE TABLE IF NOT EXISTS location_sharing_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sharing_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, group_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_member_locations_group_id ON member_locations(group_id);
CREATE INDEX IF NOT EXISTS idx_member_locations_user_id ON member_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_member_locations_updated_at ON member_locations(updated_at);
CREATE INDEX IF NOT EXISTS idx_location_sharing_settings_group_id ON location_sharing_settings(group_id);
CREATE INDEX IF NOT EXISTS idx_location_sharing_settings_user_id ON location_sharing_settings(user_id);

-- Trigger for location_sharing_settings updated_at
DROP TRIGGER IF EXISTS update_location_sharing_settings_updated_at ON location_sharing_settings;
CREATE TRIGGER update_location_sharing_settings_updated_at
  BEFORE UPDATE ON location_sharing_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE member_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_sharing_settings ENABLE ROW LEVEL SECURITY;

-- Member locations policies

-- Users can view locations of members in their groups (only if sharing is enabled)
CREATE POLICY "Users can view group member locations"
  ON member_locations FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM location_sharing_settings
      WHERE location_sharing_settings.user_id = member_locations.user_id
      AND location_sharing_settings.group_id = member_locations.group_id
      AND location_sharing_settings.sharing_enabled = true
    )
  );

-- Users can insert/update their own location
CREATE POLICY "Users can upsert their own location"
  ON member_locations FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own location"
  ON member_locations FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own location
CREATE POLICY "Users can delete their own location"
  ON member_locations FOR DELETE
  USING (user_id = auth.uid());

-- Location sharing settings policies

-- Users can view their own sharing settings
CREATE POLICY "Users can view their sharing settings"
  ON location_sharing_settings FOR SELECT
  USING (user_id = auth.uid());

-- Users can view sharing settings of group members (to know who is sharing)
CREATE POLICY "Users can view group members sharing status"
  ON location_sharing_settings FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
  );

-- Users can insert/update their own sharing settings
CREATE POLICY "Users can upsert their sharing settings"
  ON location_sharing_settings FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their sharing settings"
  ON location_sharing_settings FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own sharing settings
CREATE POLICY "Users can delete their sharing settings"
  ON location_sharing_settings FOR DELETE
  USING (user_id = auth.uid());

-- View for member locations with sharing status (for efficient queries)
CREATE OR REPLACE VIEW member_locations_with_sharing AS
SELECT
  ml.*,
  lss.sharing_enabled
FROM member_locations ml
LEFT JOIN location_sharing_settings lss
  ON ml.user_id = lss.user_id
  AND ml.group_id = lss.group_id
WHERE lss.sharing_enabled = true;
