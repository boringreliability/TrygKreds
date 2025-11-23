/**
 * Mock for expo-location module
 */

export const requestForegroundPermissionsAsync = jest.fn();
export const getForegroundPermissionsAsync = jest.fn();
export const getCurrentPositionAsync = jest.fn();
export const getLastKnownPositionAsync = jest.fn();
export const hasServicesEnabledAsync = jest.fn();

export const Accuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
  BestForNavigation: 6,
};

export default {
  requestForegroundPermissionsAsync,
  getForegroundPermissionsAsync,
  getCurrentPositionAsync,
  getLastKnownPositionAsync,
  hasServicesEnabledAsync,
  Accuracy,
};
