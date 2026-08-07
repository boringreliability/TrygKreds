/**
 * Ward 6: Privacy Domain Tests
 *
 * Feature: Privacy controls
 */

import { getMyVisibility, pauseAllSharing } from './privacy';
import * as groups from './groups';
import * as location from './location';

jest.mock('./groups');
jest.mock('./location');

const mockGroups = groups as jest.Mocked<typeof groups>;
const mockLocation = location as jest.Mocked<typeof location>;

const USER_ID = 'user-me';

const group = (id: string, name: string): groups.GroupWithRole => ({
  id,
  name,
  ownerId: USER_ID,
  inviteCode: 'AAAA111111',
  createdAt: new Date().toISOString(),
  role: 'owner',
});

const member = (
  userId: string,
  displayName: string | null,
  groupId: string
): groups.GroupMember => ({
  id: `m-${userId}-${groupId}`,
  groupId,
  userId,
  role: 'member',
  joinedAt: new Date().toISOString(),
  displayName,
});

describe('Privacy Domain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocation.disableLocationSharing.mockResolvedValue({ success: true });
  });

  describe('getMyVisibility', () => {
    it('should list who can see me, grouped by group', async () => {
      mockGroups.getMyGroups.mockResolvedValue({
        success: true,
        groups: [group('g-1', 'Family'), group('g-2', 'Work')],
      });
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['g-1', 'g-2'],
      });
      mockGroups.getGroupMembers.mockImplementation(async (groupId) => ({
        success: true,
        members:
          groupId === 'g-1'
            ? [member(USER_ID, 'Me', 'g-1'), member('user-mor', 'Mor', 'g-1')]
            : [member(USER_ID, 'Me', 'g-2'), member('user-far', 'Far', 'g-2')],
      }));

      const result = await getMyVisibility(USER_ID);

      expect(result.success).toBe(true);
      expect(result.groups).toEqual([
        {
          groupId: 'g-1',
          groupName: 'Family',
          sharingEnabled: true,
          viewers: [{ userId: 'user-mor', displayName: 'Mor' }],
        },
        {
          groupId: 'g-2',
          groupName: 'Work',
          sharingEnabled: true,
          viewers: [{ userId: 'user-far', displayName: 'Far' }],
        },
      ]);
    });

    // "Who can see my location" means other people.
    it('should never list me as able to see myself', async () => {
      mockGroups.getMyGroups.mockResolvedValue({
        success: true,
        groups: [group('g-1', 'Family')],
      });
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['g-1'],
      });
      mockGroups.getGroupMembers.mockResolvedValue({
        success: true,
        members: [member(USER_ID, 'Me', 'g-1')],
      });

      const result = await getMyVisibility(USER_ID);

      expect(result.groups?.[0].viewers).toEqual([]);
    });

    // Not sharing means nobody can see you there, whoever else is in the group.
    it('should report nobody as a viewer for a group I do not share with', async () => {
      mockGroups.getMyGroups.mockResolvedValue({
        success: true,
        groups: [group('g-1', 'Family')],
      });
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: [],
      });
      mockGroups.getGroupMembers.mockResolvedValue({
        success: true,
        members: [
          member(USER_ID, 'Me', 'g-1'),
          member('user-mor', 'Mor', 'g-1'),
        ],
      });

      const result = await getMyVisibility(USER_ID);

      expect(result.groups?.[0].sharingEnabled).toBe(false);
      expect(result.groups?.[0].viewers).toEqual([]);
    });

    it('should keep a member with no display name, as null', async () => {
      mockGroups.getMyGroups.mockResolvedValue({
        success: true,
        groups: [group('g-1', 'Family')],
      });
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['g-1'],
      });
      mockGroups.getGroupMembers.mockResolvedValue({
        success: true,
        members: [member('user-x', null, 'g-1')],
      });

      const result = await getMyVisibility(USER_ID);

      expect(result.groups?.[0].viewers).toEqual([
        { userId: 'user-x', displayName: null },
      ]);
    });

    it('should return an empty list when I am in no groups', async () => {
      mockGroups.getMyGroups.mockResolvedValue({ success: true, groups: [] });
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: [],
      });

      const result = await getMyVisibility(USER_ID);

      expect(result.success).toBe(true);
      expect(result.groups).toEqual([]);
      expect(mockGroups.getGroupMembers).not.toHaveBeenCalled();
    });

    it('should fail when the group list cannot be loaded', async () => {
      mockGroups.getMyGroups.mockResolvedValue({
        success: false,
        error: 'network down',
      });
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: [],
      });

      const result = await getMyVisibility(USER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toBe('network down');
    });

    // Not knowing what you are sharing is not something to paper over: showing
    // "not shared" when the lookup failed would be a reassuring lie.
    it('should fail when the sharing state cannot be loaded', async () => {
      mockGroups.getMyGroups.mockResolvedValue({
        success: true,
        groups: [group('g-1', 'Family')],
      });
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: false,
        error: 'network down',
      });

      const result = await getMyVisibility(USER_ID);

      expect(result.success).toBe(false);
    });

    it('should treat a group whose members cannot be read as having no known viewers', async () => {
      mockGroups.getMyGroups.mockResolvedValue({
        success: true,
        groups: [group('g-1', 'Family')],
      });
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['g-1'],
      });
      mockGroups.getGroupMembers.mockResolvedValue({
        success: false,
        error: 'denied',
      });

      const result = await getMyVisibility(USER_ID);

      expect(result.success).toBe(true);
      expect(result.groups?.[0].viewers).toEqual([]);
      // The sharing state is still reported accurately, which is the part that
      // matters most on this screen.
      expect(result.groups?.[0].sharingEnabled).toBe(true);
    });
  });

  describe('pauseAllSharing', () => {
    it('should disable sharing for every group being shared', async () => {
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['g-1', 'g-2'],
      });

      const result = await pauseAllSharing(USER_ID);

      expect(result.success).toBe(true);
      expect(result.pausedGroupIds).toEqual(['g-1', 'g-2']);
      expect(mockLocation.disableLocationSharing).toHaveBeenCalledWith(
        USER_ID,
        'g-1'
      );
      expect(mockLocation.disableLocationSharing).toHaveBeenCalledWith(
        USER_ID,
        'g-2'
      );
    });

    it('should do nothing when nothing is being shared', async () => {
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: [],
      });

      const result = await pauseAllSharing(USER_ID);

      expect(result.success).toBe(true);
      expect(result.pausedGroupIds).toEqual([]);
      expect(mockLocation.disableLocationSharing).not.toHaveBeenCalled();
    });

    // Half-paused must not report success: the user asked to be invisible.
    it('should report failure when a group could not be paused', async () => {
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['g-1', 'g-2'],
      });
      mockLocation.disableLocationSharing
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'denied' });

      const result = await pauseAllSharing(USER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toContain('denied');
      // The ones that did work stay reported, so the UI can show what remains.
      expect(result.pausedGroupIds).toEqual(['g-1']);
    });

    it('should keep going after one group fails', async () => {
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: true,
        groupIds: ['g-1', 'g-2'],
      });
      mockLocation.disableLocationSharing
        .mockResolvedValueOnce({ success: false, error: 'denied' })
        .mockResolvedValueOnce({ success: true });

      const result = await pauseAllSharing(USER_ID);

      expect(mockLocation.disableLocationSharing).toHaveBeenCalledTimes(2);
      expect(result.pausedGroupIds).toEqual(['g-2']);
    });

    it('should fail when it cannot find out what is being shared', async () => {
      mockLocation.getMySharingGroupIds.mockResolvedValue({
        success: false,
        error: 'network down',
      });

      const result = await pauseAllSharing(USER_ID);

      expect(result.success).toBe(false);
      expect(mockLocation.disableLocationSharing).not.toHaveBeenCalled();
    });
  });
});
