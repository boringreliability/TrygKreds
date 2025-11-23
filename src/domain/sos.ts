/**
 * SOS Domain Module
 *
 * Core logic for SOS panic button functionality.
 * Handles creating SOS events, checking cooldown, and retrieving events.
 */

import { supabase } from '../services/supabase';

// Constants
export const SOS_COOLDOWN_MS = 60000; // 1 minute cooldown between SOS events

// Types
export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface SosEvent {
  id: string;
  userId: string;
  groupId: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  createdAt: string;
}

export interface SosEventInput {
  userId: string;
  groupId: string;
  coordinates: LocationCoordinates | null;
}

export interface SosEventResult {
  success: boolean;
  event?: SosEvent;
  error?: string;
}

export interface SosEventsListResult {
  success: boolean;
  events?: SosEvent[];
  error?: string;
}

export interface CanTriggerResult {
  canTrigger: boolean;
  cooldownRemaining: number;
}

// Helper to map Supabase row to SosEvent type
function mapSupabaseSosEvent(row: {
  id: string;
  user_id: string;
  group_id: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  created_at: string;
}): SosEvent {
  return {
    id: row.id,
    userId: row.user_id,
    groupId: row.group_id,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    createdAt: row.created_at,
  };
}

/**
 * Create a new SOS event
 */
export async function createSosEvent(
  input: SosEventInput
): Promise<SosEventResult> {
  const { data, error } = await supabase
    .from('sos_events')
    .insert({
      user_id: input.userId,
      group_id: input.groupId,
      latitude: input.coordinates?.latitude ?? null,
      longitude: input.coordinates?.longitude ?? null,
      accuracy: input.coordinates?.accuracy ?? null,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    event: mapSupabaseSosEvent(data),
  };
}

/**
 * Get SOS events for a group
 */
export async function getSosEventsForGroup(
  groupId: string,
  limit = 50
): Promise<SosEventsListResult> {
  const { data, error } = await supabase
    .from('sos_events')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { success: false, error: error.message };
  }

  const events: SosEvent[] = (data || []).map(mapSupabaseSosEvent);

  return { success: true, events };
}

/**
 * Check if user can trigger SOS (cooldown check)
 */
export async function canTriggerSos(userId: string): Promise<CanTriggerResult> {
  const cooldownStart = new Date(Date.now() - SOS_COOLDOWN_MS).toISOString();

  const { data, error } = await supabase
    .from('sos_events')
    .select('id, created_at')
    .eq('user_id', userId)
    .gte('created_at', cooldownStart)
    .order('created_at', { ascending: false })
    .limit(1);

  // If there's an error, fail-open (allow SOS for safety)
  if (error || !data) {
    return { canTrigger: true, cooldownRemaining: 0 };
  }

  if (data.length === 0) {
    return { canTrigger: true, cooldownRemaining: 0 };
  }

  // Calculate remaining cooldown
  const lastEventTime = new Date(data[0].created_at).getTime();
  const cooldownEnd = lastEventTime + SOS_COOLDOWN_MS;
  const now = Date.now();

  if (now >= cooldownEnd) {
    return { canTrigger: true, cooldownRemaining: 0 };
  }

  return {
    canTrigger: false,
    cooldownRemaining: cooldownEnd - now,
  };
}

/**
 * Get all groups a user is a member of
 */
export async function getUserGroups(
  userId: string
): Promise<{ groupIds: string[]; error?: string }> {
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId);

  if (error) {
    return { groupIds: [], error: error.message };
  }

  return {
    groupIds: (data || []).map((row: { group_id: string }) => row.group_id),
  };
}

/**
 * Trigger SOS for all groups user belongs to
 */
export async function triggerSosForAllGroups(
  userId: string,
  coordinates: LocationCoordinates | null
): Promise<{
  success: boolean;
  events?: SosEvent[];
  error?: string;
}> {
  // Get all user's groups
  const { groupIds, error: groupsError } = await getUserGroups(userId);

  if (groupsError) {
    return { success: false, error: groupsError };
  }

  if (groupIds.length === 0) {
    return { success: false, error: 'User is not a member of any groups' };
  }

  // Create SOS events for all groups
  const events: SosEvent[] = [];
  const errors: string[] = [];

  for (const groupId of groupIds) {
    const result = await createSosEvent({
      userId,
      groupId,
      coordinates,
    });

    if (result.success && result.event) {
      events.push(result.event);
    } else if (result.error) {
      errors.push(result.error);
    }
  }

  if (events.length === 0) {
    return {
      success: false,
      error: errors.join(', ') || 'Failed to create SOS events',
    };
  }

  return { success: true, events };
}
