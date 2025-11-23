/**
 * Mock for expo-location module
 */

export const requestForegroundPermissionsAsync = jest.fn();
export const getForegroundPermissionsAsync = jest.fn();
export const requestBackgroundPermissionsAsync = jest.fn();
export const getBackgroundPermissionsAsync = jest.fn();
export const getCurrentPositionAsync = jest.fn();
export const getLastKnownPositionAsync = jest.fn();
export const hasServicesEnabledAsync = jest.fn();
export const startLocationUpdatesAsync = jest.fn();
export const stopLocationUpdatesAsync = jest.fn();
export const hasStartedLocationUpdatesAsync = jest.fn();

export const Accuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
  BestForNavigation: 6,
};

export const ActivityType = {
  Other: 1,
  AutomotiveNavigation: 2,
  Fitness: 3,
  OtherNavigation: 4,
  Airborne: 5,
};

export default {
  requestForegroundPermissionsAsync,
  getForegroundPermissionsAsync,
  requestBackgroundPermissionsAsync,
  getBackgroundPermissionsAsync,
  getCurrentPositionAsync,
  getLastKnownPositionAsync,
  hasServicesEnabledAsync,
  startLocationUpdatesAsync,
  stopLocationUpdatesAsync,
  hasStartedLocationUpdatesAsync,
  Accuracy,
  ActivityType,
};
