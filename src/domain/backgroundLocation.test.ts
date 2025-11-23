/**
 * Ward 4: Background Location Domain Tests
 *
 * Feature: Background location updates
 * Tests for background location update decision logic
 */

import {
  shouldSendLocationUpdate,
  calculateDistance,
  getBackgroundConfig,
  type BackgroundLocationConfig,
  type LocationUpdateContext,
} from './backgroundLocation';

describe('Background Location Domain', () => {
  describe('getBackgroundConfig', () => {
    it('should return default configuration', () => {
      const config = getBackgroundConfig();

      expect(config.minIntervalMs).toBe(60000); // 1 minute
      expect(config.minDistanceMeters).toBe(50); // 50 meters
      expect(config.lowPowerMinIntervalMs).toBe(300000); // 5 minutes
    });

    it('should allow custom configuration override', () => {
      const customConfig: Partial<BackgroundLocationConfig> = {
        minIntervalMs: 120000,
        minDistanceMeters: 100,
      };

      const config = getBackgroundConfig(customConfig);

      expect(config.minIntervalMs).toBe(120000);
      expect(config.minDistanceMeters).toBe(100);
      expect(config.lowPowerMinIntervalMs).toBe(300000); // default unchanged
    });
  });

  describe('calculateDistance', () => {
    it('should calculate zero distance for same coordinates', () => {
      const distance = calculateDistance(
        { latitude: 55.6761, longitude: 12.5683 },
        { latitude: 55.6761, longitude: 12.5683 }
      );

      expect(distance).toBe(0);
    });

    it('should calculate correct distance between two points', () => {
      // Copenhagen to Malmö is approximately 28 km
      const distance = calculateDistance(
        { latitude: 55.6761, longitude: 12.5683 }, // Copenhagen
        { latitude: 55.6050, longitude: 13.0038 } // Malmö
      );

      // Should be around 28000 meters
      expect(distance).toBeGreaterThan(25000);
      expect(distance).toBeLessThan(35000);
    });

    it('should calculate short distances accurately', () => {
      // Approximately 100 meters difference
      const distance = calculateDistance(
        { latitude: 55.6761, longitude: 12.5683 },
        { latitude: 55.6770, longitude: 12.5683 }
      );

      // Should be around 100 meters
      expect(distance).toBeGreaterThan(80);
      expect(distance).toBeLessThan(120);
    });
  });

  describe('shouldSendLocationUpdate', () => {
    const defaultConfig = getBackgroundConfig();

    describe('when sharing is disabled', () => {
      it('should not send update when sharing is disabled for all groups', () => {
        const context: LocationUpdateContext = {
          sharingEnabled: false,
          lastUpdateTimestamp: null,
          lastCoordinates: null,
          currentCoordinates: { latitude: 55.6761, longitude: 12.5683 },
          isLowPowerMode: false,
        };

        const result = shouldSendLocationUpdate(context, defaultConfig);

        expect(result.shouldUpdate).toBe(false);
        expect(result.reason).toBe('sharing_disabled');
      });
    });

    describe('when no previous update exists', () => {
      it('should send update when this is the first update', () => {
        const context: LocationUpdateContext = {
          sharingEnabled: true,
          lastUpdateTimestamp: null,
          lastCoordinates: null,
          currentCoordinates: { latitude: 55.6761, longitude: 12.5683 },
          isLowPowerMode: false,
        };

        const result = shouldSendLocationUpdate(context, defaultConfig);

        expect(result.shouldUpdate).toBe(true);
        expect(result.reason).toBe('first_update');
      });
    });

    describe('time-based throttling', () => {
      it('should not send update if minimum interval has not passed', () => {
        const now = Date.now();
        const context: LocationUpdateContext = {
          sharingEnabled: true,
          lastUpdateTimestamp: now - 30000, // 30 seconds ago
          lastCoordinates: { latitude: 55.6761, longitude: 12.5683 },
          currentCoordinates: { latitude: 55.6800, longitude: 12.5700 }, // Moved significantly
          isLowPowerMode: false,
        };

        const result = shouldSendLocationUpdate(context, defaultConfig);

        expect(result.shouldUpdate).toBe(false);
        expect(result.reason).toBe('too_soon');
      });

      it('should send update if minimum interval has passed', () => {
        const now = Date.now();
        const context: LocationUpdateContext = {
          sharingEnabled: true,
          lastUpdateTimestamp: now - 120000, // 2 minutes ago
          lastCoordinates: { latitude: 55.6761, longitude: 12.5683 },
          currentCoordinates: { latitude: 55.6800, longitude: 12.5700 }, // Moved significantly
          isLowPowerMode: false,
        };

        const result = shouldSendLocationUpdate(context, defaultConfig);

        expect(result.shouldUpdate).toBe(true);
        expect(result.reason).toBe('interval_passed');
      });
    });

    describe('distance-based throttling', () => {
      it('should not send update if distance moved is below threshold', () => {
        const now = Date.now();
        const context: LocationUpdateContext = {
          sharingEnabled: true,
          lastUpdateTimestamp: now - 120000, // 2 minutes ago (interval passed)
          lastCoordinates: { latitude: 55.6761, longitude: 12.5683 },
          currentCoordinates: { latitude: 55.6762, longitude: 12.5683 }, // Moved ~10 meters
          isLowPowerMode: false,
        };

        const result = shouldSendLocationUpdate(context, defaultConfig);

        expect(result.shouldUpdate).toBe(false);
        expect(result.reason).toBe('insufficient_distance');
      });

      it('should send update if distance moved exceeds threshold', () => {
        const now = Date.now();
        const context: LocationUpdateContext = {
          sharingEnabled: true,
          lastUpdateTimestamp: now - 120000, // 2 minutes ago
          lastCoordinates: { latitude: 55.6761, longitude: 12.5683 },
          currentCoordinates: { latitude: 55.6800, longitude: 12.5700 }, // Moved ~500 meters
          isLowPowerMode: false,
        };

        const result = shouldSendLocationUpdate(context, defaultConfig);

        expect(result.shouldUpdate).toBe(true);
        expect(result.reason).toBe('interval_passed');
      });
    });

    describe('low power mode', () => {
      it('should use longer interval in low power mode', () => {
        const now = Date.now();
        const context: LocationUpdateContext = {
          sharingEnabled: true,
          lastUpdateTimestamp: now - 120000, // 2 minutes ago (normal interval passed)
          lastCoordinates: { latitude: 55.6761, longitude: 12.5683 },
          currentCoordinates: { latitude: 55.6800, longitude: 12.5700 }, // Moved significantly
          isLowPowerMode: true,
        };

        const result = shouldSendLocationUpdate(context, defaultConfig);

        // Should not update because low power interval (5 min) hasn't passed
        expect(result.shouldUpdate).toBe(false);
        expect(result.reason).toBe('too_soon');
      });

      it('should send update when low power interval has passed', () => {
        const now = Date.now();
        const context: LocationUpdateContext = {
          sharingEnabled: true,
          lastUpdateTimestamp: now - 360000, // 6 minutes ago
          lastCoordinates: { latitude: 55.6761, longitude: 12.5683 },
          currentCoordinates: { latitude: 55.6800, longitude: 12.5700 }, // Moved significantly
          isLowPowerMode: true,
        };

        const result = shouldSendLocationUpdate(context, defaultConfig);

        expect(result.shouldUpdate).toBe(true);
        expect(result.reason).toBe('interval_passed');
      });
    });

    describe('edge cases', () => {
      it('should handle missing last coordinates gracefully', () => {
        const now = Date.now();
        const context: LocationUpdateContext = {
          sharingEnabled: true,
          lastUpdateTimestamp: now - 120000,
          lastCoordinates: null, // No previous coordinates
          currentCoordinates: { latitude: 55.6761, longitude: 12.5683 },
          isLowPowerMode: false,
        };

        const result = shouldSendLocationUpdate(context, defaultConfig);

        expect(result.shouldUpdate).toBe(true);
        expect(result.reason).toBe('no_previous_coordinates');
      });

      it('should handle missing current coordinates', () => {
        const now = Date.now();
        const context: LocationUpdateContext = {
          sharingEnabled: true,
          lastUpdateTimestamp: now - 120000,
          lastCoordinates: { latitude: 55.6761, longitude: 12.5683 },
          currentCoordinates: null,
          isLowPowerMode: false,
        };

        const result = shouldSendLocationUpdate(context, defaultConfig);

        expect(result.shouldUpdate).toBe(false);
        expect(result.reason).toBe('no_current_location');
      });
    });
  });
});
