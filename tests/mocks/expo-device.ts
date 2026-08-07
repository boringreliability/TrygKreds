/**
 * Mock for expo-device
 *
 * `isDevice` is a mutable let rather than a const so tests can simulate a
 * simulator, where Expo cannot mint a push token.
 */

export let isDevice = true;

export const __setIsDevice = (value: boolean) => {
  isDevice = value;
};

export default { isDevice };
