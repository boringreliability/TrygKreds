/**
 * Ward 3: Location Service Tests
 *
 * Tests for the location service wrapper (mocking Expo Location)
 */

import {
  requestForegroundPermission,
  getForegroundPermissionStatus,
  getCurrentLocation,
  getLastKnownLocation,
  isLocationServicesEnabled,
} from './location';

// Mock Expo Location
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  Accuracy: {
    Balanced: 3,
  },
  // Mirrors expo-location's PermissionStatus string enum. The real module types
  // declare `status` as this enum, so the mocked resolved values must use it
  // rather than bare string literals. The runtime values are the same strings.
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
}));

import * as ExpoLocation from 'expo-location';

const mockExpoLocation = ExpoLocation as jest.Mocked<typeof ExpoLocation>;

describe('Location Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestForegroundPermission', () => {
    it('should return granted status when permission is granted', async () => {
      mockExpoLocation.requestForegroundPermissionsAsync.mockResolvedValue({
        status: ExpoLocation.PermissionStatus.GRANTED,
        canAskAgain: true,
        granted: true,
        expires: 'never',
      });

      const result = await requestForegroundPermission();

      expect(result.status).toBe('granted');
      expect(result.canAskAgain).toBe(true);
    });

    it('should return denied status when permission is denied', async () => {
      mockExpoLocation.requestForegroundPermissionsAsync.mockResolvedValue({
        status: ExpoLocation.PermissionStatus.DENIED,
        canAskAgain: false,
        granted: false,
        expires: 'never',
      });

      const result = await requestForegroundPermission();

      expect(result.status).toBe('denied');
      expect(result.canAskAgain).toBe(false);
    });
  });

  describe('getForegroundPermissionStatus', () => {
    it('should return current permission status', async () => {
      mockExpoLocation.getForegroundPermissionsAsync.mockResolvedValue({
        status: ExpoLocation.PermissionStatus.GRANTED,
        canAskAgain: true,
        granted: true,
        expires: 'never',
      });

      const result = await getForegroundPermissionStatus();

      expect(result.status).toBe('granted');
    });

    it('should return undetermined for new app', async () => {
      mockExpoLocation.getForegroundPermissionsAsync.mockResolvedValue({
        status: ExpoLocation.PermissionStatus.UNDETERMINED,
        canAskAgain: true,
        granted: false,
        expires: 'never',
      });

      const result = await getForegroundPermissionStatus();

      expect(result.status).toBe('undetermined');
      expect(result.canAskAgain).toBe(true);
    });
  });

  describe('getCurrentLocation', () => {
    it('should return location when permission is granted', async () => {
      mockExpoLocation.getForegroundPermissionsAsync.mockResolvedValue({
        status: ExpoLocation.PermissionStatus.GRANTED,
        canAskAgain: true,
        granted: true,
        expires: 'never',
      });
      mockExpoLocation.getCurrentPositionAsync.mockResolvedValue({
        coords: {
          latitude: 55.6761,
          longitude: 12.5683,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      });

      const result = await getCurrentLocation();

      expect(result.success).toBe(true);
      expect(result.coordinates?.latitude).toBe(55.6761);
      expect(result.coordinates?.longitude).toBe(12.5683);
      expect(result.coordinates?.accuracy).toBe(10);
    });

    it('should return error when permission is denied', async () => {
      mockExpoLocation.getForegroundPermissionsAsync.mockResolvedValue({
        status: ExpoLocation.PermissionStatus.DENIED,
        canAskAgain: false,
        granted: false,
        expires: 'never',
      });

      const result = await getCurrentLocation();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Location permission not granted');
    });

    it('should handle location fetch error', async () => {
      mockExpoLocation.getForegroundPermissionsAsync.mockResolvedValue({
        status: ExpoLocation.PermissionStatus.GRANTED,
        canAskAgain: true,
        granted: true,
        expires: 'never',
      });
      mockExpoLocation.getCurrentPositionAsync.mockRejectedValue(
        new Error('Location unavailable')
      );

      const result = await getCurrentLocation();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Location unavailable');
    });

    it('should handle null accuracy', async () => {
      mockExpoLocation.getForegroundPermissionsAsync.mockResolvedValue({
        status: ExpoLocation.PermissionStatus.GRANTED,
        canAskAgain: true,
        granted: true,
        expires: 'never',
      });
      mockExpoLocation.getCurrentPositionAsync.mockResolvedValue({
        coords: {
          latitude: 55.6761,
          longitude: 12.5683,
          accuracy: null,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      });

      const result = await getCurrentLocation();

      expect(result.success).toBe(true);
      expect(result.coordinates?.accuracy).toBe(0);
    });
  });

  describe('getLastKnownLocation', () => {
    it('should return last known location when available', async () => {
      mockExpoLocation.getForegroundPermissionsAsync.mockResolvedValue({
        status: ExpoLocation.PermissionStatus.GRANTED,
        canAskAgain: true,
        granted: true,
        expires: 'never',
      });
      mockExpoLocation.getLastKnownPositionAsync.mockResolvedValue({
        coords: {
          latitude: 55.6761,
          longitude: 12.5683,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      });

      const result = await getLastKnownLocation();

      expect(result.success).toBe(true);
      expect(result.coordinates?.latitude).toBe(55.6761);
    });

    it('should return error when no last known location', async () => {
      mockExpoLocation.getForegroundPermissionsAsync.mockResolvedValue({
        status: ExpoLocation.PermissionStatus.GRANTED,
        canAskAgain: true,
        granted: true,
        expires: 'never',
      });
      mockExpoLocation.getLastKnownPositionAsync.mockResolvedValue(null);

      const result = await getLastKnownLocation();

      expect(result.success).toBe(false);
      expect(result.error).toBe('No last known location available');
    });

    it('should return error when permission denied', async () => {
      mockExpoLocation.getForegroundPermissionsAsync.mockResolvedValue({
        status: ExpoLocation.PermissionStatus.DENIED,
        canAskAgain: false,
        granted: false,
        expires: 'never',
      });

      const result = await getLastKnownLocation();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Location permission not granted');
    });
  });

  describe('isLocationServicesEnabled', () => {
    it('should return true when location services are enabled', async () => {
      mockExpoLocation.hasServicesEnabledAsync.mockResolvedValue(true);

      const result = await isLocationServicesEnabled();

      expect(result).toBe(true);
    });

    it('should return false when location services are disabled', async () => {
      mockExpoLocation.hasServicesEnabledAsync.mockResolvedValue(false);

      const result = await isLocationServicesEnabled();

      expect(result).toBe(false);
    });
  });
});
