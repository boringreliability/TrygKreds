/**
 * Ward 4: Background Location Task Tests
 *
 * Tests for the background location task handler
 */

import {
  processBackgroundLocation,
  updateBackgroundState,
  getBackgroundState,
  resetBackgroundState,
  setLowPowerMode,
} from './backgroundLocationTask';

// Mock Supabase client
const mockSupabaseFrom = jest.fn();
const mockGetSession = jest.fn();

jest.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => mockSupabaseFrom(table),
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

// Mock domain location
const mockUpdateMyLocation = jest.fn();

jest.mock('../domain/location', () => ({
  updateMyLocation: (userId: string, groupId: string, coords: unknown) =>
    mockUpdateMyLocation(userId, groupId, coords),
}));

// Helper to create chainable mock
const createChainableMock = (finalResult: unknown) => {
  const mock = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => void) => resolve(finalResult),
  };
  return mock;
};

describe('Background Location Task', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetBackgroundState();
  });

  describe('background state management', () => {
    it('should start with initial state', () => {
      const state = getBackgroundState();

      expect(state.lastUpdateTimestamp).toBeNull();
      expect(state.lastCoordinates).toBeNull();
      expect(state.isLowPowerMode).toBe(false);
    });

    it('should update background state', () => {
      updateBackgroundState({
        lastUpdateTimestamp: 1234567890,
        lastCoordinates: { latitude: 55.6761, longitude: 12.5683 },
      });

      const state = getBackgroundState();

      expect(state.lastUpdateTimestamp).toBe(1234567890);
      expect(state.lastCoordinates?.latitude).toBe(55.6761);
    });

    it('should reset background state', () => {
      updateBackgroundState({
        lastUpdateTimestamp: 1234567890,
        lastCoordinates: { latitude: 55.6761, longitude: 12.5683 },
        isLowPowerMode: true,
      });

      resetBackgroundState();
      const state = getBackgroundState();

      expect(state.lastUpdateTimestamp).toBeNull();
      expect(state.lastCoordinates).toBeNull();
      expect(state.isLowPowerMode).toBe(false);
    });

    it('should set low power mode', () => {
      setLowPowerMode(true);

      expect(getBackgroundState().isLowPowerMode).toBe(true);

      setLowPowerMode(false);

      expect(getBackgroundState().isLowPowerMode).toBe(false);
    });
  });

  describe('processBackgroundLocation', () => {
    it('should do nothing when locations array is empty', async () => {
      await processBackgroundLocation({ locations: [] });

      expect(mockGetSession).not.toHaveBeenCalled();
    });

    it('should do nothing when user is not authenticated', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      await processBackgroundLocation({
        locations: [
          {
            coords: { latitude: 55.6761, longitude: 12.5683, accuracy: 10 },
            timestamp: Date.now(),
          },
        ],
      });

      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });

    it('should not update when sharing is disabled', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
      });

      const chainMock = createChainableMock({ data: [], error: null });
      mockSupabaseFrom.mockReturnValue(chainMock);

      await processBackgroundLocation({
        locations: [
          {
            coords: { latitude: 55.6761, longitude: 12.5683, accuracy: 10 },
            timestamp: Date.now(),
          },
        ],
      });

      expect(mockUpdateMyLocation).not.toHaveBeenCalled();
    });

    it('should update location when sharing is enabled and conditions are met', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
      });

      const chainMock = createChainableMock({
        data: [{ group_id: 'group-1' }, { group_id: 'group-2' }],
        error: null,
      });
      mockSupabaseFrom.mockReturnValue(chainMock);
      mockUpdateMyLocation.mockResolvedValue({ success: true });

      // Reset state to ensure first update is sent
      resetBackgroundState();

      await processBackgroundLocation({
        locations: [
          {
            coords: { latitude: 55.6761, longitude: 12.5683, accuracy: 10 },
            timestamp: Date.now(),
          },
        ],
      });

      expect(mockUpdateMyLocation).toHaveBeenCalledTimes(2);
      expect(mockUpdateMyLocation).toHaveBeenCalledWith(
        'user-123',
        'group-1',
        expect.objectContaining({
          latitude: 55.6761,
          longitude: 12.5683,
        })
      );
      expect(mockUpdateMyLocation).toHaveBeenCalledWith(
        'user-123',
        'group-2',
        expect.objectContaining({
          latitude: 55.6761,
          longitude: 12.5683,
        })
      );
    });

    it('should use the latest location from the array', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
      });

      const chainMock = createChainableMock({
        data: [{ group_id: 'group-1' }],
        error: null,
      });
      mockSupabaseFrom.mockReturnValue(chainMock);
      mockUpdateMyLocation.mockResolvedValue({ success: true });

      resetBackgroundState();

      await processBackgroundLocation({
        locations: [
          {
            coords: { latitude: 55.0, longitude: 12.0, accuracy: 10 },
            timestamp: Date.now() - 1000,
          },
          {
            coords: { latitude: 55.6761, longitude: 12.5683, accuracy: 10 },
            timestamp: Date.now(),
          },
        ],
      });

      expect(mockUpdateMyLocation).toHaveBeenCalledWith(
        'user-123',
        'group-1',
        expect.objectContaining({
          latitude: 55.6761,
          longitude: 12.5683,
        })
      );
    });

    it('should update background state after successful update', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
      });

      const chainMock = createChainableMock({
        data: [{ group_id: 'group-1' }],
        error: null,
      });
      mockSupabaseFrom.mockReturnValue(chainMock);
      mockUpdateMyLocation.mockResolvedValue({ success: true });

      resetBackgroundState();

      await processBackgroundLocation({
        locations: [
          {
            coords: { latitude: 55.6761, longitude: 12.5683, accuracy: 10 },
            timestamp: Date.now(),
          },
        ],
      });

      const state = getBackgroundState();
      expect(state.lastCoordinates?.latitude).toBe(55.6761);
      expect(state.lastUpdateTimestamp).not.toBeNull();
    });
  });
});
