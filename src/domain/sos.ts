/**
 * SOS Domain Module
 *
 * Raising an emergency alert, and the push tokens that make it reach people.
 *
 * Two design points worth knowing before changing anything here:
 *
 * 1. Recording comes before notifying. If the push relay is down, the people who
 *    open the app still see the SOS. The reverse order would risk an alert that
 *    was delivered but left no record.
 *
 * 2. The notification carries no coordinates. It passes through Apple, Google and
 *    Expo's relay, none of which need to know where anyone is. Recipients open
 *    the app and read the position from the database, where row level security
 *    still applies.
 */

import { supabase } from '../services/supabase';
import { getCurrentUser } from './auth';
import { getMyGroups } from './groups';
import { getCurrentLocation } from '../services/location';

export interface SosEvent {
  id: string;
  userId: string;
  groupId: string;
  /** null when the SOS was raised without location permission or without a fix. */
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  createdAt: string;
}

export interface SosNotificationPayload {
  title: string;
  body: string;
  /** Enough for the app to open the right group. Deliberately no coordinates. */
  data: { type: 'sos'; groupId?: string };
}

export interface TriggerSosResult {
  success: boolean;
  /** Groups an event was recorded for. */
  groupIds?: string[];
  /** Whether a position was attached. False is a normal outcome, not an error. */
  hadLocation?: boolean;
  /** Whether the notification request succeeded. The event is recorded either way. */
  notified?: boolean;
  notifyError?: string;
  error?: string;
}

export interface SosEventsResult {
  success: boolean;
  events?: SosEvent[];
  error?: string;
}

export interface SimpleResult {
  success: boolean;
  error?: string;
}

/**
 * What the recipients' phones will show.
 *
 * Pure, so the "no coordinates" property is testable without a network. Keep it
 * that way: this payload is the only part of an SOS that leaves the database.
 */
export function buildSosNotification(
  senderName: string | null | undefined,
  groupName: string,
  groupId?: string
): SosNotificationPayload {
  const name = senderName?.trim() || 'A group member';

  return {
    title: 'SOS',
    body: `${name} needs help — sent an SOS in ${groupName}. Open TrygKreds to see their last known location.`,
    data: { type: 'sos', groupId },
  };
}

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
 * Raise an SOS in every group the user belongs to.
 *
 * A missing position is an ordinary outcome, not a failure: permission may have
 * been refused, or there may be no fix indoors. The event is recorded either way,
 * because the alert matters more than the coordinates.
 */
export async function triggerSos(): Promise<TriggerSosResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: 'You must be signed in to send an SOS' };
  }

  const groupsResult = await getMyGroups(user.id);
  if (!groupsResult.success || !groupsResult.groups) {
    return {
      success: false,
      error: groupsResult.error ?? 'Could not load your groups',
    };
  }

  if (groupsResult.groups.length === 0) {
    return { success: false, error: 'You are not a member of any group' };
  }

  const groupIds = groupsResult.groups.map((group) => group.id);

  // Best effort. Never block the alert on getting a fix.
  const locationResult = await getCurrentLocation();
  const coordinates =
    locationResult.success && locationResult.coordinates
      ? locationResult.coordinates
      : null;

  const rows = groupIds.map((groupId) => ({
    user_id: user.id,
    group_id: groupId,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    accuracy: coordinates?.accuracy ?? null,
  }));

  // Record first. An alert that was delivered but left no record would be worse
  // than one recorded but undelivered.
  const { error } = await supabase.from('sos_events').insert(rows).select();

  if (error) {
    return { success: false, error: error.message };
  }

  // Then notify. Sending is the Edge Function's job: it runs with the service
  // role, which is the only thing permitted to read a push token.
  const { error: notifyError } = await supabase.functions.invoke(
    'send-sos-notification',
    { body: { groupIds } }
  );

  return {
    success: true,
    groupIds,
    hadLocation: coordinates !== null,
    notified: !notifyError,
    notifyError: notifyError?.message,
  };
}

/**
 * Register this device for push notifications.
 *
 * Goes through a database function, never a table write. push_tokens is sealed:
 * end users hold no privilege on it, so nobody -- including the owner -- can read
 * a token back. The consequence is that a client cannot check whether its stored
 * token is current, so it re-registers on every app start instead.
 */
export async function registerPushToken(
  token: string,
  platform: 'ios' | 'android' | 'web'
): Promise<SimpleResult> {
  if (!token.trim()) {
    return { success: false, error: 'A push token is required' };
  }

  const { error } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: platform,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Forget this device, so a shared phone stops receiving alerts for an account
 * that has signed out of it.
 */
export async function removePushToken(token: string): Promise<SimpleResult> {
  const { error } = await supabase.rpc('remove_my_push_token', {
    p_token: token,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function getGroupSosEvents(
  groupId: string
): Promise<SosEventsResult> {
  const { data, error } = await supabase
    .from('sos_events')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, events: (data || []).map(mapSupabaseSosEvent) };
}

/**
 * Delete one of your own SOS events.
 *
 * A false alarm should not become a permanent record of where you were. The RLS
 * policy restricts this to the sender.
 */
export async function deleteSosEvent(eventId: string): Promise<SimpleResult> {
  const { error } = await supabase
    .from('sos_events')
    .delete()
    .eq('id', eventId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
