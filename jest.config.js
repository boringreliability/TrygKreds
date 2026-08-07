/** @type {import('jest').Config} */
const config = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  // `transformIgnorePatterns` is deliberately NOT overridden here. The jest-expo
  // preset maintains the correct list for the installed SDK, including the
  // exclusions for react-native-reanimated/plugin and @react-native/babel-preset
  // which must not be transformed. Overriding it silently drops those.
  //
  // Jest matchers (toHaveTextContent, toBeOnTheScreen, ...) are registered
  // automatically by @testing-library/react-native v13+, so the deprecated
  // @testing-library/jest-native extend-expect setup file is no longer needed.
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^expo-location$': '<rootDir>/tests/mocks/expo-location.ts',
    '^expo-task-manager$': '<rootDir>/tests/mocks/expo-task-manager.ts',
    '^expo-notifications$': '<rootDir>/tests/mocks/expo-notifications.ts',
    '^expo-device$': '<rootDir>/tests/mocks/expo-device.ts',
    '^expo-constants$': '<rootDir>/tests/mocks/expo-constants.ts',
    '^react-native-maps$': '<rootDir>/tests/mocks/react-native-maps.tsx',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/'],
};

module.exports = config;
