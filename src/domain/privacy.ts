/**
 * Privacy Domain Module
 *
 * Answering "who can see me?" and stopping it.
 *
 * The part of this ward that actually protects anyone already lives elsewhere:
 * disableLocationSharing() deletes the stored position rather than hiding it
 * behind a policy, so no caller can pause sharing and leave a position in the
 * database. This module is the control surface over that.
 *
 * It reads and writes through the Supabase layer only -- the background task is
 * an Expo concern and is coordinated in src/services/sharingControl.ts, so that
 * the domain layer stays free of the platform.
 */

import { getMyGroups, getGroupMembers } from './groups';
import { getMySharingGroupIds, disableLocationSharing } from './location';

export interface LocationViewer {
  userId: string;
  /** null when they have not chosen a display name. */
  displayName: string | null;
}

export interface GroupVisibility {
  groupId: string;
  groupName: string;
  sharingEnabled: boolean;
  /**
   * Who can currently see this user's location in this group. Empty when sharing
   * is off, whoever else is in the group -- because that is the truth the user
   * cares about on this screen.
   */
  viewers: LocationViewer[];
}

export interface VisibilityResult {
  success: boolean;
  groups?: GroupVisibility[];
  error?: string;
}

export interface PauseAllResult {
  success: boolean;
  /** Groups actually paused, so the UI can show what remains if some failed. */
  pausedGroupIds?: string[];
  error?: string;
}

/**
 * Every group the user is in, whether they are sharing with it, and who can see
 * them there.
 *
 * One screen's worth of truth in one call. Note that a failure to read the
 * sharing state is a hard failure rather than a default to "not shared":
 * displaying "nobody can see you" when we do not actually know would be a
 * reassuring lie, which is the worst kind of bug this screen could have.
 */
export async function getMyVisibility(
  userId: string
): Promise<VisibilityResult> {
  const [groupsResult, sharingResult] = await Promise.all([
    getMyGroups(userId),
    getMySharingGroupIds(userId),
  ]);

  if (!groupsResult.success || !groupsResult.groups) {
    return {
      success: false,
      error: groupsResult.error ?? 'Could not load your groups',
    };
  }

  if (!sharingResult.success || !sharingResult.groupIds) {
    return {
      success: false,
      error: sharingResult.error ?? 'Could not load your sharing settings',
    };
  }

  const sharingGroupIds = new Set(sharingResult.groupIds);

  const groups: GroupVisibility[] = await Promise.all(
    groupsResult.groups.map(async (group) => {
      const sharingEnabled = sharingGroupIds.has(group.id);

      // Nobody can see you in a group you are not sharing with, so there is no
      // reason to ask who is in it.
      if (!sharingEnabled) {
        return {
          groupId: group.id,
          groupName: group.name,
          sharingEnabled: false,
          viewers: [],
        };
      }

      const membersResult = await getGroupMembers(group.id);

      // A group whose members cannot be read still reports its sharing state
      // accurately, which is the part that matters most here.
      const viewers: LocationViewer[] =
        membersResult.success && membersResult.members
          ? membersResult.members
              // "Who can see my location" means other people.
              .filter((member) => member.userId !== userId)
              .map((member) => ({
                userId: member.userId,
                displayName: member.displayName ?? null,
              }))
          : [];

      return {
        groupId: group.id,
        groupName: group.name,
        sharingEnabled: true,
        viewers,
      };
    })
  );

  return { success: true, groups };
}

/**
 * Stop sharing with everyone, in one action.
 *
 * Each group goes through disableLocationSharing(), so each stored position is
 * deleted rather than hidden.
 *
 * A partial failure is reported as a failure. The user asked to become
 * invisible; telling them it worked when one group can still see them would be
 * the one unacceptable outcome. The groups that did succeed are still returned,
 * so the screen can show exactly what remains.
 */
export async function pauseAllSharing(userId: string): Promise<PauseAllResult> {
  const sharingResult = await getMySharingGroupIds(userId);

  if (!sharingResult.success || !sharingResult.groupIds) {
    return {
      success: false,
      error: sharingResult.error ?? 'Could not load your sharing settings',
    };
  }

  const pausedGroupIds: string[] = [];
  const failures: string[] = [];

  for (const groupId of sharingResult.groupIds) {
    const result = await disableLocationSharing(userId, groupId);

    if (result.success) {
      pausedGroupIds.push(groupId);
    } else {
      // Keep going: one group refusing is no reason to leave the rest visible.
      failures.push(result.error ?? 'Unknown error');
    }
  }

  if (failures.length > 0) {
    return {
      success: false,
      pausedGroupIds,
      error: `Could not stop sharing with every group: ${failures.join('; ')}`,
    };
  }

  return { success: true, pausedGroupIds };
}
