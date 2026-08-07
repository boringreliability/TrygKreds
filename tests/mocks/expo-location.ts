/**
 * Mock for expo-location module
 */

export const requestForegroundPermissionsAsync = jest.fn();
export const getForegroundPermissionsAsync = jest.fn();
export const getCurrentPositionAsync = jest.fn();
export const getLastKnownPositionAsync = jest.fn();
export const hasServicesEnabledAsync = jest.fn();

// --- Ward 4: background location -------------------------------------------
export const requestBackgroundPermissionsAsync = jest.fn();
export const getBackgroundPermissionsAsync = jest.fn();
export const startLocationUpdatesAsync = jest.fn();
export const stopLocationUpdatesAsync = jest.fn();
export const hasStartedLocationUpdatesAsync = jest.fn();

// Mirrors expo-location's PermissionStatus string enum, so tests can use the
// enum rather than bare literals (the real module types require it).
export const PermissionStatus = {
  GRANTED: 'granted',
  DENIED: 'denied',
  UNDETERMINED: 'undetermined',
} as const;

export const Accuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
  BestForNavigation: 6,
};

export default {
  PermissionStatus,
  requestForegroundPermissionsAsync,
  getForegroundPermissionsAsync,
  getCurrentPositionAsync,
  getLastKnownPositionAsync,
  hasServicesEnabledAsync,
  requestBackgroundPermissionsAsync,
  getBackgroundPermissionsAsync,
  startLocationUpdatesAsync,
  stopLocationUpdatesAsync,
  hasStartedLocationUpdatesAsync,
  Accuracy,
};
