/**
 * Ward 4: Background location service tests
 *
 * Feature: Background location updates
 *
 * The task handler is the one piece of Ward 4 the OS calls directly, so these
 * tests invoke it the way the OS would: by pulling the registered handler out of
 * the task manager and calling it with a batch of fixes.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import {
  BACKGROUND_LOCATION_TASK,
  defineBackgroundLocationTask,
  requestBackgroundPermission,
  startBackgroundLocationUpdates,
  stopBackgroundLocationUpdates,
  isBackgroundLocationRunning,
} from './backgroundLocation';
import * as sync from '../domain/backgroundLocationSync';
import { BACKGROUND_LOCATION_CONFIG } from '../domain/backgroundLocation';

jest.mock('../domain/backgroundLocationSync');

const mockLocation = Location as jest.Mocked<typeof Location>;
const mockSync = sync as jest.Mocked<typeof sync>;
// Test-only helpers exposed by tests/mocks/expo-task-manager.ts
const taskManagerMock = TaskManager as unknown as {
  __getTaskHandler: (
    name: string
  ) =>
    ((body: { data?: unknown; error?: unknown }) => Promise<void>) | undefined;
  __resetTasks: () => void;
};

const locationObject = (
  latitude: number,
  timestamp: number,
  accuracy: number | null = 10
) =>
  ({
    coords: {
      latitude,
      longitude: 12.5683,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp,
  }) as Location.LocationObject;

const runTask = async (body: { data?: unknown; error?: unknown }) => {
  defineBackgroundLocationTask();
  const handler = taskManagerMock.__getTaskHandler(BACKGROUND_LOCATION_TASK);
  expect(handler).toBeDefined();
  await handler!(body);
};

describe('Background location service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    taskManagerMock.__resetTasks();

    mockSync.syncBackgroundLocation.mockResolvedValue({
      ran: true,
      updated: ['group-a'],
      skipped: [],
      failed: [],
    });
    mockLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
    mockLocation.getForegroundPermissionsAsync.mockResolvedValue({
      status: Location.PermissionStatus.GRANTED,
      canAskAgain: true,
      granted: true,
      expires: 'never',
    });
    mockLocation.requestBackgroundPermissionsAsync.mockResolvedValue({
      status: Location.PermissionStatus.GRANTED,
      canAskAgain: true,
      granted: true,
      expires: 'never',
    });
  });

  describe('task registration', () => {
    it('should register the task', () => {
      defineBackgroundLocationTask();

      expect(TaskManager.defineTask).toHaveBeenCalledWith(
        BACKGROUND_LOCATION_TASK,
        expect.any(Function)
      );
    });

    it('should not register the task twice', () => {
      defineBackgroundLocationTask();
      defineBackgroundLocationTask();

      expect(TaskManager.defineTask).toHaveBeenCalledTimes(1);
    });
  });

  describe('the task handler', () => {
    it('should hand the fix to the domain layer', async () => {
      await runTask({ data: { locations: [locationObject(55.6761, 1000)] } });

      expect(mockSync.syncBackgroundLocation).toHaveBeenCalledWith({
        latitude: 55.6761,
        longitude: 12.5683,
        accuracy: 10,
        timestamp: 1000,
      });
    });

    // The OS may deliver a batch. Only the newest fix can be the current
    // position; writing the older ones would be writing history.
    it('should use the newest fix of a batch', async () => {
      await runTask({
        data: {
          locations: [
            locationObject(55.1, 1000),
            locationObject(55.9, 3000),
            locationObject(55.5, 2000),
          ],
        },
      });

      expect(mockSync.syncBackgroundLocation).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: 55.9, timestamp: 3000 })
      );
    });

    it('should do nothing when the task reports an error', async () => {
      await runTask({ error: { message: 'task failed' } });

      expect(mockSync.syncBackgroundLocation).not.toHaveBeenCalled();
    });

    it('should do nothing when there are no locations', async () => {
      await runTask({ data: { locations: [] } });

      expect(mockSync.syncBackgroundLocation).not.toHaveBeenCalled();
    });

    it('should do nothing when there is no data at all', async () => {
      await runTask({});

      expect(mockSync.syncBackgroundLocation).not.toHaveBeenCalled();
    });

    it('should pass an unreported accuracy through as null', async () => {
      await runTask({
        data: { locations: [locationObject(55.6761, 1000, null)] },
      });

      expect(mockSync.syncBackgroundLocation).toHaveBeenCalledWith(
        expect.objectContaining({ accuracy: null })
      );
    });
  });

  describe('the task stops itself when it should not be running', () => {
    it('should stop when the user is signed out', async () => {
      mockLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
      mockSync.syncBackgroundLocation.mockResolvedValue({
        ran: false,
        reason: 'signed-out',
        updated: [],
        skipped: [],
        failed: [],
      });

      await runTask({ data: { locations: [locationObject(55.6761, 1000)] } });

      expect(mockLocation.stopLocationUpdatesAsync).toHaveBeenCalledWith(
        BACKGROUND_LOCATION_TASK
      );
    });

    it('should stop when the user shares with nobody', async () => {
      mockLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
      mockSync.syncBackgroundLocation.mockResolvedValue({
        ran: false,
        reason: 'not-sharing',
        updated: [],
        skipped: [],
        failed: [],
      });

      await runTask({ data: { locations: [locationObject(55.6761, 1000)] } });

      expect(mockLocation.stopLocationUpdatesAsync).toHaveBeenCalled();
    });

    // A transient lookup failure is not a reason to tear the task down; it would
    // then never restart on its own.
    it('should keep running after a transient lookup failure', async () => {
      mockLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
      mockSync.syncBackgroundLocation.mockResolvedValue({
        ran: false,
        reason: 'lookup-failed',
        updated: [],
        skipped: [],
        failed: [],
      });

      await runTask({ data: { locations: [locationObject(55.6761, 1000)] } });

      expect(mockLocation.stopLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('should keep running on a normal update', async () => {
      mockLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true);

      await runTask({ data: { locations: [locationObject(55.6761, 1000)] } });

      expect(mockLocation.stopLocationUpdatesAsync).not.toHaveBeenCalled();
    });
  });

  describe('requestBackgroundPermission', () => {
    it('should not ask for background access without foreground access', async () => {
      mockLocation.getForegroundPermissionsAsync.mockResolvedValue({
        status: Location.PermissionStatus.DENIED,
        canAskAgain: false,
        granted: false,
        expires: 'never',
      });

      const granted = await requestBackgroundPermission();

      expect(granted).toBe(false);
      expect(
        mockLocation.requestBackgroundPermissionsAsync
      ).not.toHaveBeenCalled();
    });

    it('should report a denied background permission', async () => {
      mockLocation.requestBackgroundPermissionsAsync.mockResolvedValue({
        status: Location.PermissionStatus.DENIED,
        canAskAgain: false,
        granted: false,
        expires: 'never',
      });

      expect(await requestBackgroundPermission()).toBe(false);
    });

    it('should report a granted background permission', async () => {
      expect(await requestBackgroundPermission()).toBe(true);
    });
  });

  describe('startBackgroundLocationUpdates', () => {
    it('should ask the platform for balanced accuracy, not the highest', async () => {
      await startBackgroundLocationUpdates();

      expect(mockLocation.startLocationUpdatesAsync).toHaveBeenCalledWith(
        BACKGROUND_LOCATION_TASK,
        expect.objectContaining({ accuracy: Location.Accuracy.Balanced })
      );
    });

    it('should pass the configured interval and distance to the OS', async () => {
      await startBackgroundLocationUpdates();

      expect(mockLocation.startLocationUpdatesAsync).toHaveBeenCalledWith(
        BACKGROUND_LOCATION_TASK,
        expect.objectContaining({
          timeInterval: BACKGROUND_LOCATION_CONFIG.minIntervalMs,
          distanceInterval: BACKGROUND_LOCATION_CONFIG.minDistanceMeters,
        })
      );
    });

    // Android requires a visible notification for background location, and being
    // conspicuous is the honest choice: the user should see at a glance that the
    // app is sharing.
    it('should run a visible foreground service', async () => {
      await startBackgroundLocationUpdates();

      const options = mockLocation.startLocationUpdatesAsync.mock.calls[0]?.[1];
      expect(options?.foregroundService?.notificationTitle).toMatch(/sharing/i);
    });

    it('should not start without background permission', async () => {
      mockLocation.requestBackgroundPermissionsAsync.mockResolvedValue({
        status: Location.PermissionStatus.DENIED,
        canAskAgain: false,
        granted: false,
        expires: 'never',
      });

      const started = await startBackgroundLocationUpdates();

      expect(started).toBe(false);
      expect(mockLocation.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('should not start twice', async () => {
      mockLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true);

      const started = await startBackgroundLocationUpdates();

      expect(started).toBe(true);
      expect(mockLocation.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });
  });

  describe('stopBackgroundLocationUpdates', () => {
    it('should stop a running task', async () => {
      mockLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true);

      await stopBackgroundLocationUpdates();

      expect(mockLocation.stopLocationUpdatesAsync).toHaveBeenCalledWith(
        BACKGROUND_LOCATION_TASK
      );
    });

    it('should be a no-op when nothing is running', async () => {
      mockLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(false);

      await stopBackgroundLocationUpdates();

      expect(mockLocation.stopLocationUpdatesAsync).not.toHaveBeenCalled();
    });
  });

  describe('isBackgroundLocationRunning', () => {
    it('should report what the platform says', async () => {
      mockLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
      expect(await isBackgroundLocationRunning()).toBe(true);

      mockLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
      expect(await isBackgroundLocationRunning()).toBe(false);
    });
  });
});
