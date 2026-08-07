/**
 * Ward 2: Groups Domain Tests
 *
 * Feature: Groups
 * Tests for group creation, joining, and management (mocking Supabase)
 */

import {
  createGroup,
  joinGroup,
  leaveGroup,
  getMyGroups,
  rotateInviteCode,
  validateGroupName,
  type Group,
} from './groups';

// Mock Supabase client
const mockSupabaseFrom = jest.fn();
const mockSupabaseRpc = jest.fn();

jest.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockSupabaseFrom(table),
    rpc: (fn: string, params: unknown) => mockSupabaseRpc(fn, params),
  },
}));

// Helper to create chainable mock
const createChainableMock = (finalResult: unknown) => {
  const mock = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(finalResult),
    then: (resolve: (value: unknown) => void) => resolve(finalResult),
  };
  return mock;
};

describe('Groups Domain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateGroupName', () => {
    it('should return valid for name between 1-50 characters', () => {
      expect(validateGroupName('Family')).toEqual({ isValid: true });
      expect(validateGroupName('A')).toEqual({ isValid: true });
      expect(validateGroupName('A'.repeat(50))).toEqual({ isValid: true });
    });

    it('should return invalid for empty name', () => {
      expect(validateGroupName('')).toEqual({
        isValid: false,
        error: 'Group name is required',
      });
    });

    it('should return invalid for whitespace-only name', () => {
      expect(validateGroupName('   ')).toEqual({
        isValid: false,
        error: 'Group name is required',
      });
    });

    it('should return invalid for name over 50 characters', () => {
      expect(validateGroupName('A'.repeat(51))).toEqual({
        isValid: false,
        error: 'Group name must be 50 characters or less',
      });
    });
  });

  describe('createGroup', () => {
    const mockUser = { id: 'user-123' };

    it('should create a group with valid name', async () => {
      const mockGroup: Group = {
        id: 'group-123',
        name: 'Family',
        ownerId: mockUser.id,
        inviteCode: 'ABC123',
        createdAt: new Date().toISOString(),
        memberCount: 1,
      };

      const chainMock = createChainableMock({
        data: {
          id: mockGroup.id,
          name: mockGroup.name,
          owner_id: mockGroup.ownerId,
          invite_code: mockGroup.inviteCode,
          created_at: mockGroup.createdAt,
        },
        error: null,
      });
      mockSupabaseFrom.mockReturnValue(chainMock);

      const result = await createGroup('Family', mockUser.id);

      expect(result.success).toBe(true);
      expect(result.group?.name).toBe('Family');
      expect(mockSupabaseFrom).toHaveBeenCalledWith('groups');
    });

    it('should return error for invalid name', async () => {
      const result = await createGroup('', mockUser.id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Group name is required');
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });

    it('should handle Supabase error', async () => {
      const chainMock = createChainableMock({
        data: null,
        error: { message: 'Database error' },
      });
      mockSupabaseFrom.mockReturnValue(chainMock);

      const result = await createGroup('Family', mockUser.id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  // Ward 3.2: joining is a single server-side call. It cannot be done from the
  // client, because resolving an invite code to a group requires reading a row
  // the caller is not yet allowed to see, and no RLS policy can grant that
  // without exposing every group in the table.
  describe('joinGroup', () => {
    it('should join a group via the invite code and return its id', async () => {
      mockSupabaseRpc.mockResolvedValue({ data: 'group-123', error: null });

      const result = await joinGroup('ABC1234567');

      expect(result.success).toBe(true);
      expect(result.groupId).toBe('group-123');
      expect(mockSupabaseRpc).toHaveBeenCalledWith('join_group_by_invite_code', {
        p_invite_code: 'ABC1234567',
      });
    });

    it('should normalise the invite code before sending it', async () => {
      mockSupabaseRpc.mockResolvedValue({ data: 'group-123', error: null });

      await joinGroup('  abc1234567  ');

      expect(mockSupabaseRpc).toHaveBeenCalledWith('join_group_by_invite_code', {
        p_invite_code: 'ABC1234567',
      });
    });

    it('should never write to group_members directly', async () => {
      mockSupabaseRpc.mockResolvedValue({ data: 'group-123', error: null });

      await joinGroup('ABC1234567');

      // The membership row is created by the SECURITY DEFINER function, after it
      // has validated the code. A direct table write here would mean anyone who
      // learned a group's UUID could enrol themselves.
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });

    it('should reject an invalid, expired or revoked code', async () => {
      // P0002 (no_data_found) is raised for unknown, expired and revoked codes
      // alike, so the client cannot tell them apart either.
      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: { code: 'P0002', message: 'Invalid or expired invite code' },
      });

      const result = await joinGroup('EXPIRED123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid or expired invite code');
    });

    it('should return error when already a member', async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'Already a member of this group' },
      });

      const result = await joinGroup('ABC1234567');

      expect(result.success).toBe(false);
      expect(result.error).toBe('You are already a member of this group');
    });

    it('should reject an empty invite code without calling the server', async () => {
      const result = await joinGroup('   ');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invite code is required');
      expect(mockSupabaseRpc).not.toHaveBeenCalled();
    });
  });

  describe('leaveGroup', () => {
    it('should allow member to leave group', async () => {
      const deleteMock = createChainableMock({
        data: { id: 'member-123' },
        error: null,
      });
      mockSupabaseFrom.mockReturnValue(deleteMock);

      const result = await leaveGroup('group-123', 'user-456');

      expect(result.success).toBe(true);
      expect(mockSupabaseFrom).toHaveBeenCalledWith('group_members');
    });

    it('should handle leave error', async () => {
      const deleteMock = createChainableMock({
        data: null,
        error: { message: 'Cannot leave group' },
      });
      mockSupabaseFrom.mockReturnValue(deleteMock);

      const result = await leaveGroup('group-123', 'user-456');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot leave group');
    });
  });

  describe('getMyGroups', () => {
    it('should return list of user groups', async () => {
      const mockGroups = [
        {
          group: {
            id: 'group-1',
            name: 'Family',
            owner_id: 'user-123',
            invite_code: 'ABC123',
            created_at: new Date().toISOString(),
          },
          role: 'owner',
        },
        {
          group: {
            id: 'group-2',
            name: 'Friends',
            owner_id: 'user-456',
            invite_code: 'DEF456',
            created_at: new Date().toISOString(),
          },
          role: 'member',
        },
      ];

      const selectMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: mockGroups, error: null }),
      };
      mockSupabaseFrom.mockReturnValue(selectMock);

      const result = await getMyGroups('user-123');

      expect(result.success).toBe(true);
      expect(result.groups).toHaveLength(2);
      expect(result.groups?.[0].name).toBe('Family');
    });

    it('should return empty array when no groups', async () => {
      const selectMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      mockSupabaseFrom.mockReturnValue(selectMock);

      const result = await getMyGroups('user-123');

      expect(result.success).toBe(true);
      expect(result.groups).toHaveLength(0);
    });
  });

  // Ward 3.2: rotation replaces the code, clears any revocation and starts a
  // fresh expiry window. All three happen in one server-side function so they
  // cannot drift apart.
  describe('rotateInviteCode', () => {
    it('should return the new code for the owner', async () => {
      mockSupabaseRpc.mockResolvedValue({ data: 'NEWCODE1234', error: null });

      const result = await rotateInviteCode('group-123');

      expect(result.success).toBe(true);
      expect(result.inviteCode).toBe('NEWCODE1234');
      expect(mockSupabaseRpc).toHaveBeenCalledWith('rotate_invite_code', {
        p_group_id: 'group-123',
      });
    });

    it('should not update the groups table directly', async () => {
      mockSupabaseRpc.mockResolvedValue({ data: 'NEWCODE1234', error: null });

      await rotateInviteCode('group-123');

      // A client-side UPDATE would replace the code without resetting expiry
      // and revocation, quietly reviving a code the owner had revoked.
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });

    it('should reject a non-owner', async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: {
          code: '42501',
          message: 'Only the group owner can rotate the invite code',
        },
      });

      const result = await rotateInviteCode('group-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Only the group owner can rotate the invite code');
    });
  });
});
