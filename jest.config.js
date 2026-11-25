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
  // Jest's 5s default is too tight for the first test in a React Native suite.
  // That test pays the cold-start cost of the whole module graph -- React Native,
  // the react-native-maps mock, the Supabase client, the Expo mocks -- and on a
  // shared CI runner, with suites running in parallel, that is roughly six times
  // slower than on a dev machine. GroupMapScreen's first test takes ~370ms here
  // and exceeded 5000ms in CI.
  //
  // This buys headroom for slow hardware, not for slow assertions: a genuinely
  // hung test still fails, just later.
  testTimeout: 30000,
  // Runs before the test framework and before any module under test, which is
  // what src/config/env.ts needs: it throws on missing configuration, so the
  // variables have to exist before the first import of it.
  setupFiles: ['<rootDir>/tests/env.ts'],
  // Sets the async-helper budget; see tests/setup.ts for why it is not the
  // default 1000ms.
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^expo-location$': '<rootDir>/tests/mocks/expo-location.ts',
    '^expo-task-manager$': '<rootDir>/tests/mocks/expo-task-manager.ts',
    '^expo-notifications$': '<rootDir>/tests/mocks/expo-notifications.ts',
    '^expo-device$': '<rootDir>/tests/mocks/expo-device.ts',
    '^expo-constants$': '<rootDir>/tests/mocks/expo-constants.ts',
    '^expo-secure-store$': '<rootDir>/tests/mocks/expo-secure-store.ts',
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
