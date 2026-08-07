/**
 * Mock for expo-constants
 *
 * Only the fields the app reads: the EAS project id needed to mint a push token.
 */

export const expoConfig: {
  extra?: { eas?: { projectId?: string } };
} | null = {
  extra: { eas: { projectId: 'test-project-id' } },
};

export const easConfig: { projectId?: string } | null = null;

export default { expoConfig, easConfig };
