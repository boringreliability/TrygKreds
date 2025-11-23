/**
 * Groups Domain Module
 *
 * Core logic for group management in TrygKreds.
 * Handles creating, joining, leaving groups and invite codes.
 */

import { supabase } from '../services/supabase';

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
}

export interface GroupWithRole extends Group {
  role: 'owner' | 'member';
}

export interface GroupResult {
  success: boolean;
  group?: Group;
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

// Get group by invite code
export async function getGroupByInviteCode(
  inviteCode: string
): Promise<GroupResult> {
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .eq('invite_code', inviteCode.toUpperCase())
    .single();

  if (error || !data) {
    return { success: false, error: 'Invalid invite code' };
  }

  return {
    success: true,
    group: mapSupabaseGroup(data),
  };
}

// Join a group via invite code
export async function joinGroup(
  inviteCode: string,
  userId: string
): Promise<GroupResult> {
  // First, find the group
  const groupResult = await getGroupByInviteCode(inviteCode);
  if (!groupResult.success || !groupResult.group) {
    return { success: false, error: 'Invalid invite code' };
  }

  // Add user as member
  const { error } = await supabase.from('group_members').insert({
    group_id: groupResult.group.id,
    user_id: userId,
    role: 'member',
  });

  if (error) {
    // Check for duplicate key (already a member)
    if (error.code === '23505') {
      return { success: false, error: 'You are already a member of this group' };
    }
    return { success: false, error: error.message };
  }

  return {
    success: true,
    group: groupResult.group,
  };
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

  const groups: GroupWithRole[] = ((data || []) as unknown as GroupMemberWithGroup[])
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

// Generate a new invite code (owner only - authorization handled by RLS)
export async function generateNewInviteCode(
  groupId: string
): Promise<{ success: boolean; inviteCode?: string; error?: string }> {
  // Generate new code using database function
  const { data: newCode, error: rpcError } = await supabase.rpc(
    'generate_invite_code'
  );

  if (rpcError) {
    return { success: false, error: rpcError.message };
  }

  // Update the group with new code
  const { data, error } = await supabase
    .from('groups')
    .update({ invite_code: newCode })
    .eq('id', groupId)
    .select('invite_code')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    inviteCode: data.invite_code,
  };
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

  return { success: true, members };
}
