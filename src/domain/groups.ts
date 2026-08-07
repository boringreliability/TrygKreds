/**
 * Groups Domain Module
 *
 * Core logic for group management in TrygKreds.
 * Handles creating, joining, leaving groups and invite codes.
 */

import { supabase } from '../services/supabase';
import { getProfilesForUsers } from './profiles';

// Types
export interface Group {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  createdAt: string;
  memberCount?: number;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  role: 'owner' | 'member';
  joinedAt: string;
  /**
   * The member's chosen display name, or null when they have not set one.
   * Use formatMemberName() to render it -- never fall back to userId.
   */
  displayName?: string | null;
}

export interface GroupWithRole extends Group {
  role: 'owner' | 'member';
}

export interface GroupResult {
  success: boolean;
  group?: Group;
  error?: string;
}

export interface JoinGroupResult {
  success: boolean;
  /** Id of the group that was joined. The group itself becomes readable once
   *  membership exists, so callers that need more can fetch it afterwards. */
  groupId?: string;
  error?: string;
}

export interface InviteCodeResult {
  success: boolean;
  inviteCode?: string;
  error?: string;
}

export interface GroupsListResult {
  success: boolean;
  groups?: GroupWithRole[];
  error?: string;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

// Validation
const MAX_GROUP_NAME_LENGTH = 50;

export function validateGroupName(name: string): ValidationResult {
  const trimmedName = name.trim();

  if (!trimmedName) {
    return { isValid: false, error: 'Group name is required' };
  }

  if (trimmedName.length > MAX_GROUP_NAME_LENGTH) {
    return {
      isValid: false,
      error: `Group name must be ${MAX_GROUP_NAME_LENGTH} characters or less`,
    };
  }

  return { isValid: true };
}

// Helper to map Supabase row to Group type
function mapSupabaseGroup(row: {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
  member_count?: number;
}): Group {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    inviteCode: row.invite_code,
    createdAt: row.created_at,
    memberCount: row.member_count,
  };
}

// Create a new group
export async function createGroup(
  name: string,
  ownerId: string
): Promise<GroupResult> {
  // Validate name
  const validation = validateGroupName(name);
  if (!validation.isValid) {
    return { success: false, error: validation.error };
  }

  const { data, error } = await supabase
    .from('groups')
    .insert({
      name: name.trim(),
      owner_id: ownerId,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    group: mapSupabaseGroup(data),
  };
}

/**
 * Join a group via invite code.
 *
 * This is a single server-side call, and deliberately so. Resolving a code to a
 * group means reading a row the caller is not yet a member of, and RLS cannot
 * express "readable only by someone who already knows the code" -- a policy
 * permissive enough to allow that lookup would also allow SELECT over every
 * group in the table. So the whole operation -- validate the code, check its
 * expiry and revocation, create the membership -- happens inside
 * join_group_by_invite_code(), which is SECURITY DEFINER.
 *
 * The joining user is taken from the session on the server (auth.uid()); it is
 * not a parameter, because the client must not be able to choose it.
 */
export async function joinGroup(inviteCode: string): Promise<JoinGroupResult> {
  const normalisedCode = inviteCode.trim().toUpperCase();

  if (!normalisedCode) {
    return { success: false, error: 'Invite code is required' };
  }

  const { data, error } = await supabase.rpc('join_group_by_invite_code', {
    p_invite_code: normalisedCode,
  });

  if (error) {
    if (error.code === '23505') {
      return {
        success: false,
        error: 'You are already a member of this group',
      };
    }
    // P0002 covers unknown, expired and revoked codes alike -- the server does
    // not distinguish them, so that a caller cannot probe which codes exist.
    if (error.code === 'P0002') {
      return { success: false, error: 'Invalid or expired invite code' };
    }
    return { success: false, error: error.message };
  }

  return { success: true, groupId: data as string };
}

// Leave a group
export async function leaveGroup(
  groupId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Get all groups for a user (uses groups_with_member_count view for efficiency)
export async function getMyGroups(userId: string): Promise<GroupsListResult> {
  const { data, error } = await supabase
    .from('group_members')
    .select(
      `
      role,
      group:groups_with_member_count (
        id,
        name,
        owner_id,
        invite_code,
        created_at,
        member_count
      )
    `
    )
    .eq('user_id', userId);

  if (error) {
    return { success: false, error: error.message };
  }

  interface GroupMemberWithGroup {
    role: string;
    group: {
      id: string;
      name: string;
      owner_id: string;
      invite_code: string;
      created_at: string;
      member_count: number;
    } | null;
  }

  const groups: GroupWithRole[] = (
    (data || []) as unknown as GroupMemberWithGroup[]
  )
    .filter((item) => item.group !== null)
    .map((item) => ({
      ...mapSupabaseGroup(item.group!),
      role: item.role as 'owner' | 'member',
    }));

  return { success: true, groups };
}

// Get a single group by ID
export async function getGroupById(groupId: string): Promise<GroupResult> {
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .eq('id', groupId)
    .single();

  if (error || !data) {
    return { success: false, error: 'Group not found' };
  }

  return {
    success: true,
    group: mapSupabaseGroup(data),
  };
}

/**
 * Rotate a group's invite code. Owner only, enforced server-side.
 *
 * Rotation is one server-side operation because it has three effects that must
 * not drift apart: a new code, a cleared revocation, and a fresh expiry window.
 * Doing it as a client UPDATE would replace the code while leaving an earlier
 * revocation in place -- quietly reviving access the owner had cut off.
 *
 * Rotating is what makes a leaked code recoverable: the old one stops working
 * immediately, so a code sitting in an old SMS is no longer a way in.
 */
export async function rotateInviteCode(
  groupId: string
): Promise<InviteCodeResult> {
  const { data, error } = await supabase.rpc('rotate_invite_code', {
    p_group_id: groupId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, inviteCode: data as string };
}

// Get members of a group
export async function getGroupMembers(
  groupId: string
): Promise<{ success: boolean; members?: GroupMember[]; error?: string }> {
  const { data, error } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', groupId);

  if (error) {
    return { success: false, error: error.message };
  }

  const members: GroupMember[] = (data || []).map((row) => ({
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    role: row.role,
    joinedAt: row.joined_at,
  }));

  // Attach display names. As on the map, a failed name lookup degrades to
  // unnamed members rather than an empty list.
  const profilesResult = await getProfilesForUsers(
    members.map((member) => member.userId)
  );

  if (profilesResult.success && profilesResult.profiles) {
    const profiles = profilesResult.profiles;
    for (const member of members) {
      member.displayName = profiles[member.userId]?.displayName ?? null;
    }
  }

  return { success: true, members };
}
