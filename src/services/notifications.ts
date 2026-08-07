/**
 * Notifications service.
 *
 * The Expo-facing half of Ward 5: asking for permission, minting a push token,
 * and handing it to the database function that stores it.
 *
 * Minting a token contacts Expo's servers, and delivery goes through Expo's relay
 * to Apple and Google. That is the app's second third-party network path, and it
 * is disclosed in PRIVACY.md. It is also why the SOS payload built in
 * src/domain/sos.ts carries no coordinates.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

import { registerPushToken, removePushToken } from '../domain/sos';

export interface PushRegistrationResult {
  success: boolean;
  token?: string;
  /** Why registration did not happen. Most reasons are ordinary, not failures. */
  reason?: 'not-a-device' | 'permission-denied' | 'no-project-id' | 'error';
  error?: string;
}

function currentPlatform(): 'ios' | 'android' | 'web' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

/**
 * The Expo project id, which is required to mint a push token.
 *
 * Read from the app config rather than hardcoded, so a self-hoster's own project
 * is used. Without it, registration is skipped rather than guessed at.
 */
function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

/**
 * Ask for notification permission and store the resulting token.
 *
 * Called on app start while signed in. It re-registers every time on purpose:
 * push_tokens is sealed, so the client cannot read back what is stored and has no
 * way to tell whether it is current. Re-registering is idempotent -- the database
 * function upserts on the token.
 */
export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  // A simulator cannot be issued a push token, and asking produces a confusing
  // error rather than a useful one.
  if (!Device.isDevice) {
    return { success: false, reason: 'not-a-device' };
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') {
    // Refusing notifications is a legitimate choice. SOS events are still
    // recorded and still visible when someone opens the app.
    return { success: false, reason: 'permission-denied' };
  }

  const projectId = getProjectId();
  if (!projectId) {
    return { success: false, reason: 'no-project-id' };
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const stored = await registerPushToken(token, currentPlatform());
    if (!stored.success) {
      return { success: false, reason: 'error', error: stored.error };
    }

    return { success: true, token };
  } catch (error) {
    return {
      success: false,
      reason: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Forget this device on sign-out, so a shared phone stops receiving alerts for an
 * account no longer on it.
 */
export async function unregisterFromPushNotifications(): Promise<void> {
  if (!Device.isDevice) {
    return;
  }

  const projectId = getProjectId();
  if (!projectId) {
    return;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    await removePushToken(token);
  } catch {
    // Nothing useful to do: the token could not be resolved, so there is nothing
    // to remove. Failing sign-out over this would be worse.
  }
}

/**
 * How an arriving notification should behave while the app is open.
 *
 * An SOS is the only notification this app sends, so it always alerts.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
