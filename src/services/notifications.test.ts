/**
 * Ward 5: Notifications service tests
 *
 * Feature: SOS panic button
 *
 * Most of what this module does is decide when NOT to register: on a simulator,
 * without permission, without a project id. Those are ordinary outcomes rather
 * than failures, and the app must keep working through all of them.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

import {
  registerForPushNotifications,
  unregisterFromPushNotifications,
  configureNotificationHandler,
} from './notifications';
import * as sos from '../domain/sos';

jest.mock('../domain/sos');

const mockNotifications = Notifications as jest.Mocked<typeof Notifications>;
const mockSos = sos as jest.Mocked<typeof sos>;
const deviceMock = Device as unknown as { __setIsDevice: (v: boolean) => void };

const granted = {
  status: 'granted',
} as Notifications.NotificationPermissionsStatus;
const denied = {
  status: 'denied',
} as Notifications.NotificationPermissionsStatus;

describe('Notifications service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    deviceMock.__setIsDevice(true);
    mockNotifications.getPermissionsAsync.mockResolvedValue(granted);
    mockNotifications.requestPermissionsAsync.mockResolvedValue(granted);
    mockNotifications.getExpoPushTokenAsync.mockResolvedValue({
      data: 'ExponentPushToken[abc]',
      type: 'expo',
    });
    mockSos.registerPushToken.mockResolvedValue({ success: true });
    mockSos.removePushToken.mockResolvedValue({ success: true });
  });

  describe('registerForPushNotifications', () => {
    it('should register the token it was issued', async () => {
      const result = await registerForPushNotifications();

      expect(result.success).toBe(true);
      expect(result.token).toBe('ExponentPushToken[abc]');
      expect(mockSos.registerPushToken).toHaveBeenCalledWith(
        'ExponentPushToken[abc]',
        expect.stringMatching(/^(ios|android|web)$/)
      );
    });

    it('should not ask again when permission is already granted', async () => {
      await registerForPushNotifications();

      expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('should ask when permission is undetermined', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue({
        status: 'undetermined',
      } as Notifications.NotificationPermissionsStatus);

      await registerForPushNotifications();

      expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalled();
    });

    // Refusing notifications is a legitimate choice: SOS events are still
    // recorded and still visible when someone opens the app.
    it('should stop cleanly when permission is refused', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue(denied);
      mockNotifications.requestPermissionsAsync.mockResolvedValue(denied);

      const result = await registerForPushNotifications();

      expect(result.success).toBe(false);
      expect(result.reason).toBe('permission-denied');
      expect(mockNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
      expect(mockSos.registerPushToken).not.toHaveBeenCalled();
    });

    it('should skip a simulator without asking for anything', async () => {
      deviceMock.__setIsDevice(false);

      const result = await registerForPushNotifications();

      expect(result.reason).toBe('not-a-device');
      expect(mockNotifications.getPermissionsAsync).not.toHaveBeenCalled();
    });

    it('should surface a failure to store the token', async () => {
      mockSos.registerPushToken.mockResolvedValue({
        success: false,
        error: 'denied',
      });

      const result = await registerForPushNotifications();

      expect(result.success).toBe(false);
      expect(result.reason).toBe('error');
      expect(result.error).toBe('denied');
    });

    it('should survive the token request throwing', async () => {
      mockNotifications.getExpoPushTokenAsync.mockRejectedValue(
        new Error('Expo unreachable')
      );

      const result = await registerForPushNotifications();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Expo unreachable');
    });
  });

  describe('unregisterFromPushNotifications', () => {
    it('should remove the token for this device', async () => {
      await unregisterFromPushNotifications();

      expect(mockSos.removePushToken).toHaveBeenCalledWith(
        'ExponentPushToken[abc]'
      );
    });

    it('should do nothing on a simulator', async () => {
      deviceMock.__setIsDevice(false);

      await unregisterFromPushNotifications();

      expect(mockSos.removePushToken).not.toHaveBeenCalled();
    });

    // Sign-out must not fail because a token could not be resolved.
    it('should not throw when the token cannot be resolved', async () => {
      mockNotifications.getExpoPushTokenAsync.mockRejectedValue(
        new Error('Expo unreachable')
      );

      await expect(unregisterFromPushNotifications()).resolves.toBeUndefined();
      expect(mockSos.removePushToken).not.toHaveBeenCalled();
    });
  });

  describe('configureNotificationHandler', () => {
    it('should alert for arriving notifications', () => {
      configureNotificationHandler();

      expect(mockNotifications.setNotificationHandler).toHaveBeenCalled();
    });
  });
});
