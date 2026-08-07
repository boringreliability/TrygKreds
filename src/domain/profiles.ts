/**
 * Profiles Domain Module
 *
 * Display names for group members.
 *
 * A profile holds a user-chosen name and nothing else. It is readable by
 * everyone you share a group with, so anything more sensitive than a name --
 * an email address in particular -- deliberately does not live here.
 */

import { supabase } from '../services/supabase';

export const MAX_DISPLAY_NAME_LENGTH = 40;

/** Shown for a member who has not chosen a name yet. Never their user id. */
export const UNNAMED_MEMBER_LABEL = 'Unknown member';

export interface Profile {
  id: string;
  /** null until the user chooses a name. */
  displayName: string | null;
}

export interface ProfileResult {
  success: boolean;
  profile?: Profile;
  error?: string;
}

/** Profiles keyed by user id, for labelling a list of members in one pass. */
export interface ProfilesResult {
  success: boolean;
  profiles?: Record<string, Profile>;
  error?: string;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateDisplayName(name: string): ValidationResult {
  const trimmed = name.trim();

  if (!trimmed) {
    return { isValid: false, error: 'Display name is required' };
  }

  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    return {
      isValid: false,
      error: `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or less`,
    };
  }

  return { isValid: true };
}

/**
 * How a member should be labelled in the UI.
 *
 * Pure, so the fallback behaviour is testable without a renderer: a member with
 * no display name gets a neutral placeholder rather than a raw user id.
 */
export function formatMemberName(
  displayName: string | null | undefined,
  isCurrentUser: boolean
): string {
  if (isCurrentUser) {
    return 'You';
  }

  const trimmed = displayName?.trim();
  return trimmed ? trimmed : UNNAMED_MEMBER_LABEL;
}

/**
 * Single character for a member's avatar badge.
 *
 * Deliberately derived from the display name only. Using the first character of
 * a user id would put a fragment of an identifier on screen for exactly the
 * members whose names we do not know.
 */
export function memberInitial(
  displayName: string | null | undefined,
  isCurrentUser: boolean
): string {
  if (isCurrentUser) {
    return 'Y';
  }

  const trimmed = displayName?.trim();
  // Spread rather than charAt: an emoji or accented character is one visible
  // glyph but more than one UTF-16 code unit.
  return trimmed ? [...trimmed][0].toUpperCase() : '?';
}

function mapSupabaseProfile(row: {
  id: string;
  display_name: string | null;
}): Profile {
  return { id: row.id, displayName: row.display_name };
}

export async function getMyProfile(userId: string): Promise<ProfileResult> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? 'Profile not found' };
  }

  return { success: true, profile: mapSupabaseProfile(data) };
}

/**
 * Set the signed-in user's display name.
 *
 * An upsert rather than an update: a profile row is normally created by a
 * trigger when the account is created, but upserting means a missing row heals
 * itself instead of silently updating nothing. The RLS policy restricts both
 * paths to the caller's own row.
 */
export async function setMyDisplayName(
  userId: string,
  displayName: string
): Promise<ProfileResult> {
  const validation = validateDisplayName(displayName);
  if (!validation.isValid) {
    return { success: false, error: validation.error };
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, display_name: displayName.trim() })
    .select('id, display_name')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, profile: mapSupabaseProfile(data) };
}

/**
 * Look up display names for a set of users in one query.
 *
 * Profiles are fetched separately rather than embedded in the members and
 * locations queries. Those tables reference auth.users, not profiles, so an
 * embedded select would depend on PostgREST inferring a relationship that no
 * foreign key expresses. One extra round trip buys a query that cannot break in
 * that way.
 *
 * Users whose profile the caller may not read are simply absent from the
 * result -- RLS decides, and callers fall back to the neutral placeholder.
 */
export async function getProfilesForUsers(
  userIds: string[]
): Promise<ProfilesResult> {
  const uniqueIds = [...new Set(userIds)];

  if (uniqueIds.length === 0) {
    return { success: true, profiles: {} };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', uniqueIds);

  if (error) {
    return { success: false, error: error.message };
  }

  const profiles: Record<string, Profile> = {};
  for (const row of data || []) {
    profiles[row.id] = mapSupabaseProfile(row);
  }

  return { success: true, profiles };
}
