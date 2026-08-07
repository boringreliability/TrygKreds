/**
 * Ward 3: Location Domain Tests
 *
 * Feature: Basic location sharing
 * Tests for location sharing functionality (mocking Supabase and Expo Location)
 */

import {
  updateMyLocation,
  getGroupMemberLocations,
  enableLocationSharing,
  disableLocationSharing,
  getLocationSharingStatus,
  removeMyLocation,
  type LocationCoordinates,
} from './location';

// Mock Supabase client
const mockSupabaseFrom = jest.fn();

jest.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockSupabaseFrom(table),
  },
}));

// Helper to create chainable mock
const createChainableMock = (finalResult: unknown) => {
  const mock = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(finalResult),
    then: (resolve: (value: unknown) => void) => resolve(finalResult),
  };
  return mock;
};

describe('Location Domain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateMyLocation', () => {
    const mockUserId = 'user-123';
    const mockGroupId = 'group-123';
    const mockCoordinates: LocationCoordinates = {
      latitude: 55.6761,
      longitude: 12.5683,
      accuracy: 10,
    };

    it('should update location when sharing is enabled', async () => {
      const chainMock = createChainableMock({
        data: {
          id: 'loc-123',
          user_id: mockUserId,
          group_id: mockGroupId,
          latitude: mockCoordinates.latitude,
          longitude: mockCoordinates.longitude,
          accuracy: mockCoordinates.accuracy,
          updated_at: new Date().toISOString(),
        },
        error: null,
      });
      mockSupabaseFrom.mockReturnValue(chainMock);

      const result = await updateMyLocation(mockUserId, mockGroupId, mockCoordinates);

      expect(result.success).toBe(true);
      expect(mockSupabaseFrom).toHaveBeenCalledWith('member_locations');
      expect(chainMock.upsert).toHaveBeenCalled();
    });

    it('should return error when update fails', async () => {
      const chainMock = createChainableMock({
        data: null,
        error: { message: 'Database error' },
      });
      mockSupabaseFrom.mockReturnValue(chainMock);

      const result = await updateMyLocation(mockUserId, mockGroupId, mockCoordinates);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });

    it('should reject invalid coordinates', async () => {
      const invalidCoordinates: LocationCoordinates = {
        latitude: 200, // Invalid: must be between -90 and 90
        longitude: 12.5683,
        accuracy: 10,
      };

      const result = await updateMyLocation(mockUserId, mockGroupId, invalidCoordinates);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid coordinates');
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });
  });

  describe('getGroupMemberLocations', () => {
    const mockGroupId = 'group-123';

    // getGroupMemberLocations makes two calls: the locations, then the display
    // names for the users those locations belong to. Route them by table so the
    // tests do not depend on call order.
    const mockTables = (
      locationRows: unknown,
      locationError: unknown,
      profileRows: unknown = [],
      profileError: unknown = null
    ) => {
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnThis(),
            in: jest
              .fn()
              .mockResolvedValue({ data: profileRows, error: profileError }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest
            .fn()
            .mockResolvedValue({ data: locationRows, error: locationError }),
        };
      });
    };

    const locationRow = (id: string, userId: string, latitude: number) => ({
      id,
      user_id: userId,
      group_id: mockGroupId,
      latitude,
      longitude: 12.5683,
      accuracy: 10,
      updated_at: new Date().toISOString(),
    });

    it('should return locations for group members', async () => {
      mockTables(
        [locationRow('loc-1', 'user-1', 55.6761), locationRow('loc-2', 'user-2', 55.6762)],
        null
      );

      const result = await getGroupMemberLocations(mockGroupId);

      expect(result.success).toBe(true);
      expect(result.locations).toHaveLength(2);
      expect(result.locations?.[0].latitude).toBe(55.6761);
    });

    it('should return empty array when no locations', async () => {
      mockTables([], null);

      const result = await getGroupMemberLocations(mockGroupId);

      expect(result.success).toBe(true);
      expect(result.locations).toHaveLength(0);
    });

    it('should handle database error', async () => {
      mockTables(null, { message: 'Database error' });

      const result = await getGroupMemberLocations(mockGroupId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });

    // Ward 3.3: markers must be labelled with names, not user ids.
    it('should attach display names to each location', async () => {
      mockTables(
        [locationRow('loc-1', 'user-1', 55.6761), locationRow('loc-2', 'user-2', 55.6762)],
        null,
        [
          { id: 'user-1', display_name: 'Mor' },
          { id: 'user-2', display_name: 'Far' },
        ]
      );

      const result = await getGroupMemberLocations(mockGroupId);

      expect(result.locations?.[0].displayName).toBe('Mor');
      expect(result.locations?.[1].displayName).toBe('Far');
    });

    it('should use null for a member who has not set a display name', async () => {
      mockTables([locationRow('loc-1', 'user-1', 55.6761)], null, [
        { id: 'user-1', display_name: null },
      ]);

      const result = await getGroupMemberLocations(mockGroupId);

      expect(result.locations?.[0].displayName).toBeNull();
    });

    it('should use null when a profile is not visible to the caller', async () => {
      // RLS returns no row for a profile the caller may not read.
      mockTables([locationRow('loc-1', 'user-1', 55.6761)], null, []);

      const result = await getGroupMemberLocations(mockGroupId);

      expect(result.locations?.[0].displayName).toBeNull();
    });

    it('should still return locations when the profile lookup fails', async () => {
      // Not knowing what to call someone is no reason to drop them off the map.
      mockTables([locationRow('loc-1', 'user-1', 55.6761)], null, null, {
        message: 'profiles unavailable',
      });

      const result = await getGroupMemberLocations(mockGroupId);

      expect(result.success).toBe(true);
      expect(result.locations).toHaveLength(1);
      expect(result.locations?.[0].displayName).toBeUndefined();
    });
  });

  describe('enableLocationSharing', () => {
    const mockUserId = 'user-123';
    const mockGroupId = 'group-123';

    it('should enable location sharing for a group', async () => {
      const chainMock = createChainableMock({
        data: {
          id: 'sharing-123',
          user_id: mockUserId,
          group_id: mockGroupId,
          sharing_enabled: true,
        },
        error: null,
      });
      mockSupabaseFrom.mockReturnValue(chainMock);

      const result = await enableLocationSharing(mockUserId, mockGroupId);

      expect(result.success).toBe(true);
      expect(mockSupabaseFrom).toHaveBeenCalledWith('location_sharing_settings');
    });

    it('should handle error when enabling fails', async () => {
      const chainMock = createChainableMock({
        data: null,
        error: { message: 'Failed to enable sharing' },
      });
      mockSupabaseFrom.mockReturnValue(chainMock);

      const result = await enableLocationSharing(mockUserId, mockGroupId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to enable sharing');
    });
  });

  describe('disableLocationSharing', () => {
    const mockUserId = 'user-123';
    const mockGroupId = 'group-123';

    // Turning sharing off must also erase the stored position. PRIVACY.md
    // promises it, so the guarantee lives here rather than in a screen.
    const mockTables = (settingsError: unknown, locationsError: unknown) => {
      const calls: string[] = [];
      mockSupabaseFrom.mockImplementation((table: string) => {
        calls.push(table);
        if (table === 'member_locations') {
          return {
            delete: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            then: (resolve: (value: unknown) => void) =>
              resolve({ data: null, error: locationsError }),
          };
        }
        return {
          upsert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest
            .fn()
            .mockResolvedValue({ data: {}, error: settingsError }),
        };
      });
      return calls;
    };

    it('should disable location sharing for a group', async () => {
      const calls = mockTables(null, null);

      const result = await disableLocationSharing(mockUserId, mockGroupId);

      expect(result.success).toBe(true);
      expect(calls).toContain('location_sharing_settings');
    });

    it('should delete the stored position, not just hide it', async () => {
      const calls = mockTables(null, null);

      const result = await disableLocationSharing(mockUserId, mockGroupId);

      expect(result.success).toBe(true);
      expect(calls).toContain('member_locations');
    });

    it('should report a failure to delete the position', async () => {
      // Sharing is already off, so the position is hidden either way -- but the
      // user asked for it gone. Reporting success here would be the one wrong
      // answer.
      mockTables(null, { message: 'delete failed' });

      const result = await disableLocationSharing(mockUserId, mockGroupId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('delete failed');
    });

    it('should not attempt the delete if disabling sharing failed', async () => {
      const calls = mockTables({ message: 'upsert failed' }, null);

      const result = await disableLocationSharing(mockUserId, mockGroupId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('upsert failed');
      expect(calls).not.toContain('member_locations');
    });
  });

  describe('getLocationSharingStatus', () => {
    const mockUserId = 'user-123';
    const mockGroupId = 'group-123';

    it('should return sharing status when enabled', async () => {
      const chainMock = createChainableMock({
        data: {
          id: 'sharing-123',
          user_id: mockUserId,
          group_id: mockGroupId,
          sharing_enabled: true,
          created_at: new Date().toISOString(),
        },
        error: null,
      });
      mockSupabaseFrom.mockReturnValue(chainMock);

      const result = await getLocationSharingStatus(mockUserId, mockGroupId);

      expect(result.success).toBe(true);
      expect(result.status?.sharingEnabled).toBe(true);
    });

    it('should return disabled status when no record exists', async () => {
      const chainMock = createChainableMock({
        data: null,
        error: { code: 'PGRST116' }, // No rows returned
      });
      mockSupabaseFrom.mockReturnValue(chainMock);

      const result = await getLocationSharingStatus(mockUserId, mockGroupId);

      expect(result.success).toBe(true);
      expect(result.status?.sharingEnabled).toBe(false);
    });
  });

  describe('removeMyLocation', () => {
    const mockUserId = 'user-123';
    const mockGroupId = 'group-123';

    it('should remove location from group', async () => {
      const deleteMock = createChainableMock({
        data: { id: 'loc-123' },
        error: null,
      });
      mockSupabaseFrom.mockReturnValue(deleteMock);

      const result = await removeMyLocation(mockUserId, mockGroupId);

      expect(result.success).toBe(true);
      expect(mockSupabaseFrom).toHaveBeenCalledWith('member_locations');
    });

    it('should handle delete error', async () => {
      const deleteMock = createChainableMock({
        data: null,
        error: { message: 'Delete failed' },
      });
      mockSupabaseFrom.mockReturnValue(deleteMock);

      const result = await removeMyLocation(mockUserId, mockGroupId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Delete failed');
    });
  });

  describe('coordinate validation', () => {
    const mockUserId = 'user-123';
    const mockGroupId = 'group-123';

    it('should reject latitude outside valid range', async () => {
      const result = await updateMyLocation(mockUserId, mockGroupId, {
        latitude: 91,
        longitude: 0,
        accuracy: 10,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid coordinates');
    });

    it('should reject longitude outside valid range', async () => {
      const result = await updateMyLocation(mockUserId, mockGroupId, {
        latitude: 0,
        longitude: 181,
        accuracy: 10,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid coordinates');
    });

    it('should accept edge case coordinates', async () => {
      const chainMock = createChainableMock({
        data: { id: 'loc-123' },
        error: null,
      });
      mockSupabaseFrom.mockReturnValue(chainMock);

      // North pole
      const result1 = await updateMyLocation(mockUserId, mockGroupId, {
        latitude: 90,
        longitude: 0,
        accuracy: 10,
      });
      expect(result1.success).toBe(true);

      // South pole
      const result2 = await updateMyLocation(mockUserId, mockGroupId, {
        latitude: -90,
        longitude: 0,
        accuracy: 10,
      });
      expect(result2.success).toBe(true);

      // Date line
      const result3 = await updateMyLocation(mockUserId, mockGroupId, {
        latitude: 0,
        longitude: 180,
        accuracy: 10,
      });
      expect(result3.success).toBe(true);
    });
  });
});
