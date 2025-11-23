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
  generateNewInviteCode,
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

  describe('joinGroup', () => {
    const mockUserId = 'user-456';

    it('should join group with valid invite code', async () => {
      const mockGroup = {
        id: 'group-123',
        name: 'Family',
        owner_id: 'user-123',
        invite_code: 'ABC123',
      };

      // Mock for getGroupByInviteCode
      const selectMock = createChainableMock({
        data: mockGroup,
        error: null,
      });

      // Mock for insert member
      const insertMock = createChainableMock({
        data: { id: 'member-123' },
        error: null,
      });

      mockSupabaseFrom
        .mockReturnValueOnce(selectMock)
        .mockReturnValueOnce(insertMock);

      const result = await joinGroup('ABC123', mockUserId);

      expect(result.success).toBe(true);
    });

    it('should return error for invalid invite code', async () => {
      const selectMock = createChainableMock({
        data: null,
        error: null,
      });
      mockSupabaseFrom.mockReturnValue(selectMock);

      const result = await joinGroup('INVALID', mockUserId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid invite code');
    });

    it('should return error when already a member', async () => {
      const mockGroup = {
        id: 'group-123',
        name: 'Family',
      };

      const selectMock = createChainableMock({
        data: mockGroup,
        error: null,
      });

      const insertMock = createChainableMock({
        data: null,
        error: { code: '23505', message: 'duplicate key' },
      });

      mockSupabaseFrom
        .mockReturnValueOnce(selectMock)
        .mockReturnValueOnce(insertMock);

      const result = await joinGroup('ABC123', mockUserId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('You are already a member of this group');
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

  describe('generateNewInviteCode', () => {
    it('should generate new invite code for owner', async () => {
      const updateMock = createChainableMock({
        data: { invite_code: 'NEWCODE1' },
        error: null,
      });
      mockSupabaseFrom.mockReturnValue(updateMock);
      mockSupabaseRpc.mockResolvedValue({ data: 'NEWCODE1', error: null });

      const result = await generateNewInviteCode('group-123', 'user-123');

      expect(result.success).toBe(true);
      expect(result.inviteCode).toBeDefined();
    });
  });
});
