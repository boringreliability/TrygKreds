/**
 * Ward 6: Sharing control tests
 *
 * Feature: Privacy controls
 *
 * The rule under test is the one that is easy to get wrong quietly: the
 * background task must stop when the last group is paused, and must keep running
 * while any group is still shared.
 */

import { startSharing, stopSharing, stopAllSharing } from './sharingControl';
import * as location from '../domain/location';
import * as privacy from '../domain/privacy';
import * as locationService from './location';
import * as backgroundLocation from './backgroundLocation';

jest.mock('../domain/location');
jest.mock('../domain/privacy');
jest.mock('./location');
jest.mock('./backgroundLocation');

const mockLocation = location as jest.Mocked<typeof location>;
const mockPrivacy = privacy as jest.Mocked<typeof privacy>;
const mockLocationService = locationService as jest.Mocked<
  typeof locationService
>;
const mockBackground = backgroundLocation as jest.Mocked<
  typeof backgroundLocation
>;

const USER_ID = 'user-me';

describe('Sharing control', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocation.enableLocationSharing.mockResolvedValue({ success: true });
    mockLocation.disableLocationSharing.mockResolvedValue({ success: true });
    mockLocation.updateMyLocation.mockResolvedValue({ success: true });
    mockLocation.getMySharingGroupIds.mockResolvedValue({
      success: true,
      groupIds: [],
    });
    mockLocationService.getCurrentLocation.mockResolvedValue({
      success: true,
      coordinates: { latitude: 55.6761, longitude: 12.5683, accuracy: 10 },
    });
    mockBackground.startBackgroundLocationUpdates.mockResolvedValue(true);
    mockBackground.stopBackgroundLocationUpdates.mockResolvedValue(undefined);
    mockPrivacy.pauseAllSharing.mockResolvedValue({
      success: true,
      pausedGroupIds: ['g-1'],
    });
  });

  describe('startSharing', () => {
    it('should enable sharing and start background updates', async () => {
      const result = await startSharing(USER_ID, 'g-1');

      expect(result.success).toBe(true);
      expect(mockLocation.enableLocationSharing).toHaveBeenCalledWith(
        USER_ID,
        'g-1'
      );
      expect(mockBackground.startBackgroundLocationUpdates).toHaveBeenCalled();
    });

    // So the group sees something without waiting for the first background fix.
    it('should send the current position immediately', async () => {
      await startSharing(USER_ID, 'g-1');

      expect(mockLocation.updateMyLocation).toHaveBeenCalledWith(
        USER_ID,
        'g-1',
        { latitude: 55.6761, longitude: 12.5683, accuracy: 10 }
      );
    });

    it('should still enable sharing when no position is available', async () => {
      mockLocationService.getCurrentLocation.mockResolvedValue({
        success: false,
        error: 'Location unavailable',
      });

      const result = await startSharing(USER_ID, 'g-1');

      expect(result.success).toBe(true);
      expect(mockLocation.updateMyLocation).not.toHaveBeenCalled();
    });

    // Foreground sharing still works, so this is not a failure to share.
    it('should still succeed when background permission is refused', async () => {
      mockBackground.startBackgroundLocationUpdates.mockResolvedValue(false);

      const result = await startSharing(USER_ID, 'g-1');

      expect(result.success).toBe(true);
      expect(result.backgroundRunning).toBe(false);
    });

    it('should not touch the position or the task if enabling failed', async () => {
      mockLocation.enableLocationSharing.mockResolvedValue({
        success: false,
        error: 'denied',
      });

      const result = await startSharing(USER_ID, 'g-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('denied');
      expect(mockLocation.updateMyLocation).not.toHaveBeenCalled();
      expect(
        mockBackground.startBackgroundLocationUpdates
      ).not.toHaveBeenCalled();
    });
  });

  describe('stopSharing', () => {
    it('should stop the background task once nothing is shared', async () => {
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: [],
      });

      const result = await stopSharing(USER_ID, 'g-1');

      expect(result.success).toBe(true);
      expect(result.backgroundRunning).toBe(false);
      expect(mockBackground.stopBackgroundLocationUpdates).toHaveBeenCalled();
    });

    // The task serves every group, so one group pausing must not stop it.
    it('should keep the task running while another group is shared', async () => {
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['g-2'],
      });

      const result = await stopSharing(USER_ID, 'g-1');

      expect(result.backgroundRunning).toBe(true);
      expect(
        mockBackground.stopBackgroundLocationUpdates
      ).not.toHaveBeenCalled();
    });

    it('should not stop the task if disabling failed', async () => {
      mockLocation.disableLocationSharing.mockResolvedValue({
        success: false,
        error: 'denied',
      });

      const result = await stopSharing(USER_ID, 'g-1');

      expect(result.success).toBe(false);
      expect(
        mockBackground.stopBackgroundLocationUpdates
      ).not.toHaveBeenCalled();
    });

    // Guessing wrong towards "stop" would silently break sharing the user wants.
    it('should leave the task alone when it cannot check what remains', async () => {
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: false,
        error: 'network down',
      });

      const result = await stopSharing(USER_ID, 'g-1');

      expect(result.success).toBe(true);
      expect(
        mockBackground.stopBackgroundLocationUpdates
      ).not.toHaveBeenCalled();
    });
  });

  describe('stopAllSharing', () => {
    it('should pause everything and stop the background task', async () => {
      const result = await stopAllSharing(USER_ID);

      expect(result.success).toBe(true);
      expect(mockPrivacy.pauseAllSharing).toHaveBeenCalledWith(USER_ID);
      expect(mockBackground.stopBackgroundLocationUpdates).toHaveBeenCalled();
    });

    // Half-paused is not success: the user asked to be invisible.
    it('should report a partial failure as a failure', async () => {
      mockPrivacy.pauseAllSharing.mockResolvedValue({
        success: false,
        pausedGroupIds: ['g-1'],
        error: 'Could not stop sharing with every group: denied',
      });
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['g-2'],
      });

      const result = await stopAllSharing(USER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toContain('denied');
      // A group is still shared, so the task should still be running.
      expect(result.backgroundRunning).toBe(true);
    });

    it('should still stop the task when a partial failure left nothing shared', async () => {
      mockPrivacy.pauseAllSharing.mockResolvedValue({
        success: false,
        pausedGroupIds: ['g-1'],
        error: 'something went wrong',
      });
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: [],
      });

      const result = await stopAllSharing(USER_ID);

      expect(result.success).toBe(false);
      expect(mockBackground.stopBackgroundLocationUpdates).toHaveBeenCalled();
    });
  });
});
