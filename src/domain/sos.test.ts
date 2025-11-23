/**
 * Ward 5: SOS Domain Tests
 *
 * Feature: SOS panic button
 * Tests for SOS event creation and management
 */

import {
  createSosEvent,
  getSosEventsForGroup,
  canTriggerSos,
  type SosEventInput,
  type LocationCoordinates,
  SOS_COOLDOWN_MS,
} from './sos';

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
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(finalResult),
    then: (resolve: (value: unknown) => void) => resolve(finalResult),
  };
  return mock;
};

describe('SOS Domain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSosEvent', () => {
    const mockUserId = 'user-123';
    const mockGroupId = 'group-123';
    const mockCoordinates: LocationCoordinates = {
      latitude: 55.6761,
      longitude: 12.5683,
      accuracy: 10,
    };

    it('should create SOS event with location', async () => {
      const chainMock = createChainableMock({
        data: {
          id: 'sos-123',
          user_id: mockUserId,
          group_id: mockGroupId,
          latitude: mockCoordinates.latitude,
          longitude: mockCoordinates.longitude,
          accuracy: mockCoordinates.accuracy,
          created_at: new Date().toISOString(),
        },
        error: null,
      });
      mockSupabaseFrom.mockReturnValue(chainMock);

      const input: SosEventInput = {
        userId: mockUserId,
        groupId: mockGroupId,
        coordinates: mockCoordinates,
      };

      const result = await createSosEvent(input);

      expect(result.success).toBe(true);
      expect(result.event?.latitude).toBe(mockCoordinates.latitude);
      expect(mockSupabaseFrom).toHaveBeenCalledWith('sos_events');
      expect(chainMock.insert).toHaveBeenCalled();
    });

    it('should create SOS event without location', async () => {
      const chainMock = createChainableMock({
        data: {
          id: 'sos-123',
          user_id: mockUserId,
          group_id: mockGroupId,
          latitude: null,
          longitude: null,
          accuracy: null,
          created_at: new Date().toISOString(),
        },
        error: null,
      });
      mockSupabaseFrom.mockReturnValue(chainMock);

      const input: SosEventInput = {
        userId: mockUserId,
        groupId: mockGroupId,
        coordinates: null,
      };

      const result = await createSosEvent(input);

      expect(result.success).toBe(true);
      expect(result.event?.latitude).toBeNull();
    });

    it('should return error when creation fails', async () => {
      const chainMock = createChainableMock({
        data: null,
        error: { message: 'Database error' },
      });
      mockSupabaseFrom.mockReturnValue(chainMock);

      const result = await createSosEvent({
        userId: mockUserId,
        groupId: mockGroupId,
        coordinates: null,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('getSosEventsForGroup', () => {
    const mockGroupId = 'group-123';

    it('should return SOS events for a group', async () => {
      const mockEvents = [
        {
          id: 'sos-1',
          user_id: 'user-1',
          group_id: mockGroupId,
          latitude: 55.6761,
          longitude: 12.5683,
          accuracy: 10,
          created_at: new Date().toISOString(),
        },
        {
          id: 'sos-2',
          user_id: 'user-2',
          group_id: mockGroupId,
          latitude: 55.6762,
          longitude: 12.5684,
          accuracy: 15,
          created_at: new Date().toISOString(),
        },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: mockEvents, error: null }),
      };
      mockSupabaseFrom.mockReturnValue(chainMock);

      const result = await getSosEventsForGroup(mockGroupId);

      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(2);
      expect(result.events?.[0].latitude).toBe(55.6761);
    });

    it('should return empty array when no events', async () => {
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      mockSupabaseFrom.mockReturnValue(chainMock);

      const result = await getSosEventsForGroup(mockGroupId);

      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(0);
    });

    it('should handle database error', async () => {
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      };
      mockSupabaseFrom.mockReturnValue(chainMock);

      const result = await getSosEventsForGroup(mockGroupId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });

    it('should limit results by default', async () => {
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      mockSupabaseFrom.mockReturnValue(chainMock);

      await getSosEventsForGroup(mockGroupId);

      expect(chainMock.limit).toHaveBeenCalledWith(50);
    });

    it('should accept custom limit', async () => {
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      mockSupabaseFrom.mockReturnValue(chainMock);

      await getSosEventsForGroup(mockGroupId, 10);

      expect(chainMock.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('canTriggerSos', () => {
    const mockUserId = 'user-123';

    it('should allow SOS when no recent events', async () => {
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      mockSupabaseFrom.mockReturnValue(chainMock);

      const result = await canTriggerSos(mockUserId);

      expect(result.canTrigger).toBe(true);
      expect(result.cooldownRemaining).toBe(0);
    });

    it('should prevent SOS during cooldown period', async () => {
      const recentEvent = {
        id: 'sos-123',
        created_at: new Date(Date.now() - 30000).toISOString(), // 30 seconds ago
      };

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [recentEvent], error: null }),
      };
      mockSupabaseFrom.mockReturnValue(chainMock);

      const result = await canTriggerSos(mockUserId);

      expect(result.canTrigger).toBe(false);
      expect(result.cooldownRemaining).toBeGreaterThan(0);
      expect(result.cooldownRemaining).toBeLessThanOrEqual(SOS_COOLDOWN_MS);
    });

    it('should allow SOS after cooldown period', async () => {
      // Old event beyond cooldown period - query returns no recent events
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }), // No recent events in cooldown window
      };
      mockSupabaseFrom.mockReturnValue(chainMock);

      const result = await canTriggerSos(mockUserId);

      expect(result.canTrigger).toBe(true);
    });

    it('should handle database error gracefully', async () => {
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      };
      mockSupabaseFrom.mockReturnValue(chainMock);

      const result = await canTriggerSos(mockUserId);

      // When there's an error, we should allow the SOS (fail-open for safety)
      expect(result.canTrigger).toBe(true);
    });
  });

  describe('SOS cooldown constant', () => {
    it('should have a reasonable cooldown period', () => {
      // Cooldown should be at least 30 seconds
      expect(SOS_COOLDOWN_MS).toBeGreaterThanOrEqual(30000);
      // Cooldown should not be more than 5 minutes
      expect(SOS_COOLDOWN_MS).toBeLessThanOrEqual(300000);
    });
  });
});
