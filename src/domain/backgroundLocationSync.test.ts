/**
 * Ward 4: Background location sync tests
 *
 * Feature: Background location updates
 *
 * The decision rules are tested as arithmetic in backgroundLocation.test.ts.
 * What is under test here is the gate and the wiring: that a signed-out or
 * non-sharing user causes no work, that only groups actually being shared with
 * are written, and that a write is always an upsert.
 */

import { syncBackgroundLocation } from './backgroundLocationSync';
import * as auth from './auth';
import * as location from './location';
import type { LocationFix } from './backgroundLocation';

jest.mock('./auth');
jest.mock('./location');

const mockAuth = auth as jest.Mocked<typeof auth>;
const mockLocation = location as jest.Mocked<typeof location>;

const NOW = 1_700_000_000_000;
const USER_ID = 'user-123';

const fix = (overrides: Partial<LocationFix> = {}): LocationFix => ({
  latitude: 55.6761,
  longitude: 12.5683,
  accuracy: 10,
  timestamp: NOW,
  ...overrides,
});

const signedIn = () => {
  mockAuth.getCurrentUser.mockResolvedValue({
    id: USER_ID,
    email: 'test@example.com',
    createdAt: new Date(NOW).toISOString(),
  });
};

describe('syncBackgroundLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocation.updateMyLocation.mockResolvedValue({ success: true });
    mockLocation.getMyStoredPositions.mockResolvedValue({
      success: true,
      positions: {},
    });
  });

  describe('the hard gate', () => {
    it('should do nothing when signed out', async () => {
      mockAuth.getCurrentUser.mockResolvedValue(null);

      const result = await syncBackgroundLocation(fix(), { now: NOW });

      expect(result.ran).toBe(false);
      expect(result.reason).toBe('signed-out');
      expect(mockLocation.updateMyLocation).not.toHaveBeenCalled();
    });

    it('should not even look up sharing settings when signed out', async () => {
      mockAuth.getCurrentUser.mockResolvedValue(null);

      await syncBackgroundLocation(fix(), { now: NOW });

      expect(mockLocation.getMySharingGroupIds).not.toHaveBeenCalled();
    });

    it('should do nothing when sharing with no group', async () => {
      signedIn();
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: [],
      });

      const result = await syncBackgroundLocation(fix(), { now: NOW });

      expect(result.ran).toBe(false);
      expect(result.reason).toBe('not-sharing');
      expect(mockLocation.updateMyLocation).not.toHaveBeenCalled();
    });

    // The gate is re-checked on every run, because the OS keeps a background
    // task registered across app restarts and it can outlive the session.
    it('should check the gate on every run, not assume registration implied it', async () => {
      signedIn();
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: [],
      });

      await syncBackgroundLocation(fix(), { now: NOW });
      await syncBackgroundLocation(fix(), { now: NOW });

      expect(mockAuth.getCurrentUser).toHaveBeenCalledTimes(2);
      expect(mockLocation.getMySharingGroupIds).toHaveBeenCalledTimes(2);
    });

    it('should stop when the sharing lookup fails', async () => {
      signedIn();
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: false,
        error: 'network down',
      });

      const result = await syncBackgroundLocation(fix(), { now: NOW });

      expect(result.ran).toBe(false);
      expect(result.reason).toBe('lookup-failed');
      expect(mockLocation.updateMyLocation).not.toHaveBeenCalled();
    });
  });

  describe('writing updates', () => {
    it('should send the first fix for a group with no stored position', async () => {
      signedIn();
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['group-a'],
      });

      const result = await syncBackgroundLocation(fix(), { now: NOW });

      expect(result.ran).toBe(true);
      expect(result.updated).toEqual(['group-a']);
      expect(mockLocation.updateMyLocation).toHaveBeenCalledWith(
        USER_ID,
        'group-a',
        { latitude: 55.6761, longitude: 12.5683, accuracy: 10 }
      );
    });

    it('should write only to groups the user is sharing with', async () => {
      signedIn();
      // Member of three groups, sharing with two.
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['group-a', 'group-c'],
      });

      const result = await syncBackgroundLocation(fix(), { now: NOW });

      expect(result.updated).toEqual(['group-a', 'group-c']);
      expect(mockLocation.updateMyLocation).toHaveBeenCalledTimes(2);
      const groupsWritten = mockLocation.updateMyLocation.mock.calls.map(
        (call) => call[1]
      );
      expect(groupsWritten).not.toContain('group-b');
    });

    it('should skip a group whose stored position is too recent', async () => {
      signedIn();
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['group-a'],
      });
      mockLocation.getMyStoredPositions.mockResolvedValue({
        success: true,
        positions: {
          'group-a': {
            latitude: 55.6761,
            longitude: 12.5683,
            sentAt: NOW - 30 * 1000,
          },
        },
      });

      const result = await syncBackgroundLocation(fix(), { now: NOW });

      expect(result.updated).toEqual([]);
      expect(result.skipped).toEqual([
        { groupId: 'group-a', reason: 'too-soon' },
      ]);
      expect(mockLocation.updateMyLocation).not.toHaveBeenCalled();
    });

    it('should skip a group the user has not moved away from', async () => {
      signedIn();
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['group-a'],
      });
      mockLocation.getMyStoredPositions.mockResolvedValue({
        success: true,
        positions: {
          'group-a': {
            latitude: 55.6761,
            longitude: 12.5683,
            sentAt: NOW - 60 * 60 * 1000,
          },
        },
      });

      const result = await syncBackgroundLocation(fix(), { now: NOW });

      expect(result.skipped).toEqual([
        expect.objectContaining({ groupId: 'group-a', reason: 'not-moved' }),
      ]);
    });

    // Each group has its own interval: one group may be due while another is not.
    it('should decide per group', async () => {
      signedIn();
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['group-fresh', 'group-stale'],
      });
      mockLocation.getMyStoredPositions.mockResolvedValue({
        success: true,
        positions: {
          'group-fresh': {
            latitude: 55.6761,
            longitude: 12.5683,
            sentAt: NOW - 10 * 1000,
          },
          'group-stale': {
            latitude: 56.15,
            longitude: 10.21,
            sentAt: NOW - 60 * 60 * 1000,
          },
        },
      });

      const result = await syncBackgroundLocation(fix(), { now: NOW });

      expect(result.updated).toEqual(['group-stale']);
      expect(result.skipped).toEqual([
        { groupId: 'group-fresh', reason: 'too-soon' },
      ]);
    });

    it('should drop an inaccurate fix without writing anything', async () => {
      signedIn();
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['group-a'],
      });

      const result = await syncBackgroundLocation(fix({ accuracy: 5000 }), {
        now: NOW,
      });

      expect(result.updated).toEqual([]);
      expect(result.skipped).toEqual([
        { groupId: 'group-a', reason: 'inaccurate' },
      ]);
      expect(mockLocation.updateMyLocation).not.toHaveBeenCalled();
    });

    it('should drop nonsense coordinates without writing anything', async () => {
      signedIn();
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['group-a'],
      });

      const result = await syncBackgroundLocation(fix({ latitude: 91 }), {
        now: NOW,
      });

      expect(result.updated).toEqual([]);
      expect(mockLocation.updateMyLocation).not.toHaveBeenCalled();
    });

    it('should substitute zero for an unreported accuracy', async () => {
      signedIn();
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['group-a'],
      });

      await syncBackgroundLocation(fix({ accuracy: null }), { now: NOW });

      expect(mockLocation.updateMyLocation).toHaveBeenCalledWith(
        USER_ID,
        'group-a',
        expect.objectContaining({ accuracy: 0 })
      );
    });

    // No history: updateMyLocation is an upsert against UNIQUE(user_id, group_id).
    // Anything that inserted would grow the history this app exists to avoid.
    it('should write through updateMyLocation, which upserts', async () => {
      signedIn();
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['group-a'],
      });

      await syncBackgroundLocation(fix(), { now: NOW });

      expect(mockLocation.updateMyLocation).toHaveBeenCalled();
    });

    it('should keep going when one group fails to write', async () => {
      signedIn();
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['group-a', 'group-b'],
      });
      mockLocation.updateMyLocation
        .mockResolvedValueOnce({ success: false, error: 'denied' })
        .mockResolvedValueOnce({ success: true });

      const result = await syncBackgroundLocation(fix(), { now: NOW });

      expect(result.updated).toEqual(['group-b']);
      expect(result.failed).toEqual([{ groupId: 'group-a', error: 'denied' }]);
    });

    // A failed read of stored positions must not be treated as "nothing stored",
    // which would look like a first fix for every group and write on every run.
    it('should not treat a failed position lookup as no stored positions', async () => {
      signedIn();
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['group-a'],
      });
      mockLocation.getMyStoredPositions.mockResolvedValue({
        success: false,
        error: 'network down',
      });

      const result = await syncBackgroundLocation(fix(), { now: NOW });

      expect(result.ran).toBe(false);
      expect(result.reason).toBe('lookup-failed');
      expect(mockLocation.updateMyLocation).not.toHaveBeenCalled();
    });
  });
});
