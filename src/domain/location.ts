/**
 * Location Domain Module
 *
 * Core logic for location sharing in TrygKreds.
 * Handles updating, retrieving, and managing location sharing settings.
 */

import { supabase } from '../services/supabase';
import { getProfilesForUsers } from './profiles';

// Types
export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface MemberLocation {
  id: string;
  userId: string;
  groupId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  updatedAt: string;
  /**
   * The member's chosen display name, or null when they have not set one or
   * their profile is not visible to the caller. Use formatMemberName() to turn
   * this into something to show a human -- never fall back to userId.
   */
  displayName?: string | null;
}

export interface LocationSharingStatus {
  userId: string;
  groupId: string;
  sharingEnabled: boolean;
  createdAt?: string;
}

export interface LocationResult {
  success: boolean;
  location?: MemberLocation;
  error?: string;
}

export interface LocationsListResult {
  success: boolean;
  locations?: MemberLocation[];
  error?: string;
}

export interface SharingStatusResult {
  success: boolean;
  status?: LocationSharingStatus;
  error?: string;
}

export interface SimpleResult {
  success: boolean;
  error?: string;
}

// Validation
export function validateCoordinates(coords: LocationCoordinates): boolean {
  const { latitude, longitude } = coords;
  return (
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

// Helper to map Supabase row to MemberLocation type
function mapSupabaseLocation(row: {
  id: string;
  user_id: string;
  group_id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  updated_at: string;
}): MemberLocation {
  return {
    id: row.id,
    userId: row.user_id,
    groupId: row.group_id,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    updatedAt: row.updated_at,
  };
}

// Update user's location for a group
export async function updateMyLocation(
  userId: string,
  groupId: string,
  coordinates: LocationCoordinates
): Promise<LocationResult> {
  // Validate coordinates
  if (!validateCoordinates(coordinates)) {
    return { success: false, error: 'Invalid coordinates' };
  }

  const { data, error } = await supabase
    .from('member_locations')
    .upsert(
      {
        user_id: userId,
        group_id: groupId,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        accuracy: coordinates.accuracy,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,group_id',
      }
    )
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    location: mapSupabaseLocation(data),
  };
}

// Get all member locations for a group
export async function getGroupMemberLocations(
  groupId: string
): Promise<LocationsListResult> {
  const { data, error } = await supabase
    .from('member_locations')
    .select('*')
    .eq('group_id', groupId);

  if (error) {
    return { success: false, error: error.message };
  }

  const locations: MemberLocation[] = (data || []).map(mapSupabaseLocation);

  // Attach display names so the map can label markers with names rather than
  // ids. A failure here degrades to unnamed markers on purpose: not knowing
  // what to call someone is no reason to drop them off the map.
  const profilesResult = await getProfilesForUsers(
    locations.map((location) => location.userId)
  );

  if (profilesResult.success && profilesResult.profiles) {
    const profiles = profilesResult.profiles;
    for (const location of locations) {
      location.displayName = profiles[location.userId]?.displayName ?? null;
    }
  }

  return { success: true, locations };
}

// Enable location sharing for a group
export async function enableLocationSharing(
  userId: string,
  groupId: string
): Promise<SimpleResult> {
  const { error } = await supabase
    .from('location_sharing_settings')
    .upsert(
      {
        user_id: userId,
        group_id: groupId,
        sharing_enabled: true,
      },
      {
        onConflict: 'user_id,group_id',
      }
    )
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Disable location sharing for a group
/**
 * Turn off location sharing for a group and delete the stored position.
 *
 * The deletion is part of this function, not of the screen that calls it. A
 * position that merely sits behind an RLS policy is still a position sitting in
 * the database, and "turning sharing off deletes it" is a promise PRIVACY.md
 * makes. Enforcing it here means every caller keeps that promise -- including
 * the background task and the privacy screen still to come.
 */
export async function disableLocationSharing(
  userId: string,
  groupId: string
): Promise<SimpleResult> {
  const { error } = await supabase
    .from('location_sharing_settings')
    .upsert(
      {
        user_id: userId,
        group_id: groupId,
        sharing_enabled: false,
      },
      {
        onConflict: 'user_id,group_id',
      }
    )
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Sharing is already off at this point, so the position is hidden either way.
  // Report a failure to erase it anyway rather than swallowing it: the user
  // asked for it gone, and silently leaving it behind would be the one outcome
  // they must not be told is a success.
  return removeMyLocation(userId, groupId);
}

// Get location sharing status for a user in a group
export async function getLocationSharingStatus(
  userId: string,
  groupId: string
): Promise<SharingStatusResult> {
  const { data, error } = await supabase
    .from('location_sharing_settings')
    .select('*')
    .eq('user_id', userId)
    .eq('group_id', groupId)
    .single();

  // No record means sharing is disabled (default state)
  if (error?.code === 'PGRST116' || !data) {
    return {
      success: true,
      status: {
        userId,
        groupId,
        sharingEnabled: false,
      },
    };
  }

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    status: {
      userId: data.user_id,
      groupId: data.group_id,
      sharingEnabled: data.sharing_enabled,
      createdAt: data.created_at,
    },
  };
}

// Remove user's location from a group
export async function removeMyLocation(
  userId: string,
  groupId: string
): Promise<SimpleResult> {
  const { error } = await supabase
    .from('member_locations')
    .delete()
    .eq('user_id', userId)
    .eq('group_id', groupId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
