/**
 * Ward 5: Notification Service Tests
 *
 * Tests for push notification service
 */

import {
  requestNotificationPermission,
  getNotificationPermissionStatus,
  getPushToken,
  sendSosNotification,
} from './notification';

// Mock Expo Notifications
jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}));

// Mock Expo Device
jest.mock('expo-device', () => ({
  isDevice: true,
}));

// Mock Supabase
const mockSupabaseFrom = jest.fn();
const mockSupabaseFunctions = {
  invoke: jest.fn(),
};

jest.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => mockSupabaseFrom(table),
    functions: {
      invoke: (...args: unknown[]) => mockSupabaseFunctions.invoke(...args),
    },
  },
}));

import * as Notifications from 'expo-notifications';

const mockNotifications = Notifications as jest.Mocked<typeof Notifications>;

describe('Notification Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestNotificationPermission', () => {
    it('should return granted status when permission is granted', async () => {
      mockNotifications.requestPermissionsAsync.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
        granted: true,
        expires: 'never',
      });

      const result = await requestNotificationPermission();

      expect(result.status).toBe('granted');
      expect(result.canAskAgain).toBe(true);
    });

    it('should return denied status when permission is denied', async () => {
      mockNotifications.requestPermissionsAsync.mockResolvedValue({
        status: 'denied',
        canAskAgain: false,
        granted: false,
        expires: 'never',
      });

      const result = await requestNotificationPermission();

      expect(result.status).toBe('denied');
      expect(result.canAskAgain).toBe(false);
    });
  });

  describe('getNotificationPermissionStatus', () => {
    it('should return current permission status', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
        granted: true,
        expires: 'never',
      });

      const result = await getNotificationPermissionStatus();

      expect(result.status).toBe('granted');
    });
  });

  describe('getPushToken', () => {
    it('should return push token when available', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
        granted: true,
        expires: 'never',
      });
      mockNotifications.getExpoPushTokenAsync.mockResolvedValue({
        type: 'expo',
        data: 'ExponentPushToken[xxxxx]',
      });

      const result = await getPushToken();

      expect(result.success).toBe(true);
      expect(result.token).toBe('ExponentPushToken[xxxxx]');
    });

    it('should return error when permission is denied', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue({
        status: 'denied',
        canAskAgain: false,
        granted: false,
        expires: 'never',
      });

      const result = await getPushToken();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Notification permission not granted');
    });

    it('should handle token fetch error', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
        granted: true,
        expires: 'never',
      });
      mockNotifications.getExpoPushTokenAsync.mockRejectedValue(
        new Error('Failed to get token')
      );

      const result = await getPushToken();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to get token');
    });
  });

  describe('sendSosNotification', () => {
    it('should send notification via Supabase function', async () => {
      mockSupabaseFunctions.invoke.mockResolvedValue({
        data: { success: true, notificationsSent: 5 },
        error: null,
      });

      const result = await sendSosNotification({
        sosEventId: 'sos-123',
        triggerUserId: 'user-123',
        triggerUserName: 'John Doe',
        groupId: 'group-123',
        groupName: 'Family',
        latitude: 55.6761,
        longitude: 12.5683,
      });

      expect(result.success).toBe(true);
      expect(result.notificationsSent).toBe(5);
      expect(mockSupabaseFunctions.invoke).toHaveBeenCalledWith(
        'send-sos-notification',
        expect.objectContaining({
          body: expect.objectContaining({
            sosEventId: 'sos-123',
            triggerUserId: 'user-123',
          }),
        })
      );
    });

    it('should handle notification without location', async () => {
      mockSupabaseFunctions.invoke.mockResolvedValue({
        data: { success: true, notificationsSent: 3 },
        error: null,
      });

      const result = await sendSosNotification({
        sosEventId: 'sos-123',
        triggerUserId: 'user-123',
        triggerUserName: 'John Doe',
        groupId: 'group-123',
        groupName: 'Family',
        latitude: null,
        longitude: null,
      });

      expect(result.success).toBe(true);
    });

    it('should handle function error', async () => {
      mockSupabaseFunctions.invoke.mockResolvedValue({
        data: null,
        error: { message: 'Function failed' },
      });

      const result = await sendSosNotification({
        sosEventId: 'sos-123',
        triggerUserId: 'user-123',
        triggerUserName: 'John Doe',
        groupId: 'group-123',
        groupName: 'Family',
        latitude: null,
        longitude: null,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Function failed');
    });

    it('should handle network error', async () => {
      mockSupabaseFunctions.invoke.mockRejectedValue(
        new Error('Network error')
      );

      const result = await sendSosNotification({
        sosEventId: 'sos-123',
        triggerUserId: 'user-123',
        triggerUserName: 'John Doe',
        groupId: 'group-123',
        groupName: 'Family',
        latitude: null,
        longitude: null,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });
});
