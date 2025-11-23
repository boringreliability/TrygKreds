/**
 * Ward 4: Background Location Service Tests
 *
 * Tests for the background location task service (mocking Expo APIs)
 */

import {
  requestBackgroundPermission,
  getBackgroundPermissionStatus,
  startBackgroundLocationUpdates,
  stopBackgroundLocationUpdates,
  isBackgroundLocationRunning,
  BACKGROUND_LOCATION_TASK,
} from './backgroundLocation';

// Mock Expo Location
jest.mock('expo-location', () => ({
  requestBackgroundPermissionsAsync: jest.fn(),
  getBackgroundPermissionsAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(),
  Accuracy: {
    Balanced: 3,
    Low: 1,
  },
  ActivityType: {
    Other: 1,
  },
}));

// Mock Expo TaskManager
jest.mock('expo-task-manager', () => ({
  isTaskRegisteredAsync: jest.fn(),
  defineTask: jest.fn(),
}));

import * as ExpoLocation from 'expo-location';
import * as TaskManager from 'expo-task-manager';

const mockExpoLocation = ExpoLocation as jest.Mocked<typeof ExpoLocation>;
const mockTaskManager = TaskManager as jest.Mocked<typeof TaskManager>;

describe('Background Location Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestBackgroundPermission', () => {
    it('should return granted status when permission is granted', async () => {
      mockExpoLocation.requestBackgroundPermissionsAsync.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
        granted: true,
        expires: 'never',
      });

      const result = await requestBackgroundPermission();

      expect(result.status).toBe('granted');
      expect(result.canAskAgain).toBe(true);
    });

    it('should return denied status when permission is denied', async () => {
      mockExpoLocation.requestBackgroundPermissionsAsync.mockResolvedValue({
        status: 'denied',
        canAskAgain: false,
        granted: false,
        expires: 'never',
      });

      const result = await requestBackgroundPermission();

      expect(result.status).toBe('denied');
      expect(result.canAskAgain).toBe(false);
    });
  });

  describe('getBackgroundPermissionStatus', () => {
    it('should return current permission status', async () => {
      mockExpoLocation.getBackgroundPermissionsAsync.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
        granted: true,
        expires: 'never',
      });

      const result = await getBackgroundPermissionStatus();

      expect(result.status).toBe('granted');
    });

    it('should return undetermined for new app', async () => {
      mockExpoLocation.getBackgroundPermissionsAsync.mockResolvedValue({
        status: 'undetermined',
        canAskAgain: true,
        granted: false,
        expires: 'never',
      });

      const result = await getBackgroundPermissionStatus();

      expect(result.status).toBe('undetermined');
      expect(result.canAskAgain).toBe(true);
    });
  });

  describe('startBackgroundLocationUpdates', () => {
    it('should start location updates when permission is granted', async () => {
      mockExpoLocation.getBackgroundPermissionsAsync.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
        granted: true,
        expires: 'never',
      });
      mockExpoLocation.startLocationUpdatesAsync.mockResolvedValue(undefined);

      const result = await startBackgroundLocationUpdates();

      expect(result.success).toBe(true);
      expect(mockExpoLocation.startLocationUpdatesAsync).toHaveBeenCalledWith(
        BACKGROUND_LOCATION_TASK,
        expect.objectContaining({
          accuracy: expect.any(Number),
          distanceInterval: expect.any(Number),
          timeInterval: expect.any(Number),
        })
      );
    });

    it('should return error when permission is denied', async () => {
      mockExpoLocation.getBackgroundPermissionsAsync.mockResolvedValue({
        status: 'denied',
        canAskAgain: false,
        granted: false,
        expires: 'never',
      });

      const result = await startBackgroundLocationUpdates();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Background location permission not granted');
      expect(mockExpoLocation.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('should handle start error gracefully', async () => {
      mockExpoLocation.getBackgroundPermissionsAsync.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
        granted: true,
        expires: 'never',
      });
      mockExpoLocation.startLocationUpdatesAsync.mockRejectedValue(
        new Error('Failed to start background task')
      );

      const result = await startBackgroundLocationUpdates();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to start background task');
    });

    it('should use low power settings when specified', async () => {
      mockExpoLocation.getBackgroundPermissionsAsync.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
        granted: true,
        expires: 'never',
      });
      mockExpoLocation.startLocationUpdatesAsync.mockResolvedValue(undefined);

      await startBackgroundLocationUpdates({ lowPowerMode: true });

      expect(mockExpoLocation.startLocationUpdatesAsync).toHaveBeenCalledWith(
        BACKGROUND_LOCATION_TASK,
        expect.objectContaining({
          accuracy: ExpoLocation.Accuracy.Low,
        })
      );
    });
  });

  describe('stopBackgroundLocationUpdates', () => {
    it('should stop location updates when running', async () => {
      mockExpoLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
      mockExpoLocation.stopLocationUpdatesAsync.mockResolvedValue(undefined);

      const result = await stopBackgroundLocationUpdates();

      expect(result.success).toBe(true);
      expect(mockExpoLocation.stopLocationUpdatesAsync).toHaveBeenCalledWith(
        BACKGROUND_LOCATION_TASK
      );
    });

    it('should succeed even if updates were not running', async () => {
      mockExpoLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(false);

      const result = await stopBackgroundLocationUpdates();

      expect(result.success).toBe(true);
      expect(mockExpoLocation.stopLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('should handle stop error gracefully', async () => {
      mockExpoLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
      mockExpoLocation.stopLocationUpdatesAsync.mockRejectedValue(
        new Error('Failed to stop')
      );

      const result = await stopBackgroundLocationUpdates();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to stop');
    });
  });

  describe('isBackgroundLocationRunning', () => {
    it('should return true when background updates are running', async () => {
      mockExpoLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true);

      const result = await isBackgroundLocationRunning();

      expect(result).toBe(true);
    });

    it('should return false when background updates are not running', async () => {
      mockExpoLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(false);

      const result = await isBackgroundLocationRunning();

      expect(result).toBe(false);
    });
  });

  describe('task registration', () => {
    it('should check if task is registered', async () => {
      mockTaskManager.isTaskRegisteredAsync.mockResolvedValue(true);

      const isRegistered = await mockTaskManager.isTaskRegisteredAsync(
        BACKGROUND_LOCATION_TASK
      );

      expect(isRegistered).toBe(true);
    });
  });
});
