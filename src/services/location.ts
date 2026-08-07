/**
 * Location Service
 *
 * Wraps Expo Location API for testable location access.
 * This module abstracts the platform-specific location APIs.
 */

import * as ExpoLocation from 'expo-location';
import type { LocationCoordinates } from '../domain/location';

export type LocationPermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface LocationServiceResult {
  success: boolean;
  coordinates?: LocationCoordinates;
  error?: string;
}

export interface PermissionResult {
  status: LocationPermissionStatus;
  canAskAgain: boolean;
}

/**
 * Request foreground location permission
 */
export async function requestForegroundPermission(): Promise<PermissionResult> {
  const { status, canAskAgain } =
    await ExpoLocation.requestForegroundPermissionsAsync();
  return {
    status: status as LocationPermissionStatus,
    canAskAgain,
  };
}

/**
 * Check current foreground location permission status
 */
export async function getForegroundPermissionStatus(): Promise<PermissionResult> {
  const { status, canAskAgain } =
    await ExpoLocation.getForegroundPermissionsAsync();
  return {
    status: status as LocationPermissionStatus,
    canAskAgain,
  };
}

/**
 * Get current device location
 */
export async function getCurrentLocation(): Promise<LocationServiceResult> {
  try {
    // Check permission first
    const permission = await getForegroundPermissionStatus();
    if (permission.status !== 'granted') {
      return {
        success: false,
        error: 'Location permission not granted',
      };
    }

    const location = await ExpoLocation.getCurrentPositionAsync({
      accuracy: ExpoLocation.Accuracy.Balanced,
    });

    return {
      success: true,
      coordinates: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get location',
    };
  }
}

/**
 * Get last known device location (faster, may be stale)
 */
export async function getLastKnownLocation(): Promise<LocationServiceResult> {
  try {
    const permission = await getForegroundPermissionStatus();
    if (permission.status !== 'granted') {
      return {
        success: false,
        error: 'Location permission not granted',
      };
    }

    const location = await ExpoLocation.getLastKnownPositionAsync();

    if (!location) {
      return {
        success: false,
        error: 'No last known location available',
      };
    }

    return {
      success: true,
      coordinates: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to get last known location',
    };
  }
}

/**
 * Check if location services are enabled on the device
 */
export async function isLocationServicesEnabled(): Promise<boolean> {
  return await ExpoLocation.hasServicesEnabledAsync();
}
