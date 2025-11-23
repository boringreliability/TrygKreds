/**
 * Notification Service
 *
 * Handles push notification registration and SOS notification sending.
 * Uses Expo Notifications and Supabase Edge Functions.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from './supabase';

export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface NotificationPermissionResult {
  status: NotificationPermissionStatus;
  canAskAgain: boolean;
}

export interface PushTokenResult {
  success: boolean;
  token?: string;
  error?: string;
}

export interface SosNotificationInput {
  sosEventId: string;
  triggerUserId: string;
  triggerUserName: string;
  groupId: string;
  groupName: string;
  latitude: number | null;
  longitude: number | null;
}

export interface SosNotificationResult {
  success: boolean;
  notificationsSent?: number;
  error?: string;
}

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionResult> {
  const { status, canAskAgain } = await Notifications.requestPermissionsAsync();
  return {
    status: status as NotificationPermissionStatus,
    canAskAgain,
  };
}

/**
 * Get current notification permission status
 */
export async function getNotificationPermissionStatus(): Promise<NotificationPermissionResult> {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  return {
    status: status as NotificationPermissionStatus,
    canAskAgain,
  };
}

/**
 * Get Expo push token for this device
 */
export async function getPushToken(): Promise<PushTokenResult> {
  try {
    // Check if running on a physical device
    if (!Device.isDevice) {
      return {
        success: false,
        error: 'Push notifications require a physical device',
      };
    }

    // Check permission
    const permission = await getNotificationPermissionStatus();
    if (permission.status !== 'granted') {
      return {
        success: false,
        error: 'Notification permission not granted',
      };
    }

    // Get token
    const tokenData = await Notifications.getExpoPushTokenAsync();

    return {
      success: true,
      token: tokenData.data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get push token',
    };
  }
}

/**
 * Register push token with backend
 */
export async function registerPushToken(
  userId: string,
  token: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        token,
        platform: Device.osName?.toLowerCase() ?? 'unknown',
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id',
      }
    );

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to register token',
    };
  }
}

/**
 * Send SOS notification to group members via Supabase Edge Function
 */
export async function sendSosNotification(
  input: SosNotificationInput
): Promise<SosNotificationResult> {
  try {
    const { data, error } = await supabase.functions.invoke(
      'send-sos-notification',
      {
        body: {
          sosEventId: input.sosEventId,
          triggerUserId: input.triggerUserId,
          triggerUserName: input.triggerUserName,
          groupId: input.groupId,
          groupName: input.groupName,
          latitude: input.latitude,
          longitude: input.longitude,
        },
      }
    );

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      notificationsSent: data?.notificationsSent ?? 0,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send notifications',
    };
  }
}
