/**
 * Background Location Domain Module
 *
 * Core logic for background location update decisions.
 * Determines when location updates should be sent based on:
 * - Sharing status
 * - Time since last update
 * - Distance moved
 * - Battery/power state
 */

// Types
export interface BackgroundLocationConfig {
  minIntervalMs: number;
  minDistanceMeters: number;
  lowPowerMinIntervalMs: number;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface LocationUpdateContext {
  sharingEnabled: boolean;
  lastUpdateTimestamp: number | null;
  lastCoordinates: Coordinates | null;
  currentCoordinates: Coordinates | null;
  isLowPowerMode: boolean;
}

export type UpdateReason =
  | 'sharing_disabled'
  | 'first_update'
  | 'too_soon'
  | 'insufficient_distance'
  | 'interval_passed'
  | 'no_previous_coordinates'
  | 'no_current_location';

export interface UpdateDecision {
  shouldUpdate: boolean;
  reason: UpdateReason;
}

// Default configuration
const DEFAULT_CONFIG: BackgroundLocationConfig = {
  minIntervalMs: 60000, // 1 minute
  minDistanceMeters: 50, // 50 meters
  lowPowerMinIntervalMs: 300000, // 5 minutes
};

/**
 * Get background location configuration with optional overrides
 */
export function getBackgroundConfig(
  overrides?: Partial<BackgroundLocationConfig>
): BackgroundLocationConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
  };
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(
  coord1: Coordinates,
  coord2: Coordinates
): number {
  const R = 6371000; // Earth's radius in meters
  const lat1Rad = (coord1.latitude * Math.PI) / 180;
  const lat2Rad = (coord2.latitude * Math.PI) / 180;
  const deltaLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const deltaLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Determine whether a location update should be sent
 * based on sharing status, time, distance, and power state
 */
export function shouldSendLocationUpdate(
  context: LocationUpdateContext,
  config: BackgroundLocationConfig
): UpdateDecision {
  // Check if sharing is enabled
  if (!context.sharingEnabled) {
    return { shouldUpdate: false, reason: 'sharing_disabled' };
  }

  // Check if we have current coordinates
  if (!context.currentCoordinates) {
    return { shouldUpdate: false, reason: 'no_current_location' };
  }

  // First update (no previous timestamp)
  if (context.lastUpdateTimestamp === null) {
    return { shouldUpdate: true, reason: 'first_update' };
  }

  // No previous coordinates - should update
  if (!context.lastCoordinates) {
    return { shouldUpdate: true, reason: 'no_previous_coordinates' };
  }

  // Determine which interval to use based on power mode
  const minInterval = context.isLowPowerMode
    ? config.lowPowerMinIntervalMs
    : config.minIntervalMs;

  // Check time since last update
  const now = Date.now();
  const timeSinceLastUpdate = now - context.lastUpdateTimestamp;

  if (timeSinceLastUpdate < minInterval) {
    return { shouldUpdate: false, reason: 'too_soon' };
  }

  // Check distance moved
  const distanceMoved = calculateDistance(
    context.lastCoordinates,
    context.currentCoordinates
  );

  if (distanceMoved < config.minDistanceMeters) {
    return { shouldUpdate: false, reason: 'insufficient_distance' };
  }

  // All checks passed - send update
  return { shouldUpdate: true, reason: 'interval_passed' };
}
