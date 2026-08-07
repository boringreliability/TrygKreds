/**
 * Sharing control.
 *
 * Turning sharing on or off is two things at once: a database change, and the
 * background task starting or stopping. Getting the second part wrong is easy and
 * quiet -- leaving the task running after the last group is paused drains battery
 * and keeps asking the OS for a position nobody will see.
 *
 * That rule lives here, once. Both the group map and the privacy screen call
 * these functions rather than each remembering it. The domain layer deliberately
 * does not: the background task is Expo, and src/domain stays free of the
 * platform.
 */

import {
  enableLocationSharing,
  disableLocationSharing,
  updateMyLocation,
  getMySharingGroupIds,
} from '../domain/location';
import { pauseAllSharing } from '../domain/privacy';
import { getCurrentLocation } from './location';
import {
  startBackgroundLocationUpdates,
  stopBackgroundLocationUpdates,
} from './backgroundLocation';

export interface SharingChangeResult {
  success: boolean;
  error?: string;
  /** Whether background updates are running after this change. */
  backgroundRunning?: boolean;
}

/**
 * Start sharing with a group.
 *
 * Sends the current position immediately, so the group sees something without
 * waiting for the first background fix. A missing position is not a failure --
 * the sharing setting is what the user asked for, and the next fix will fill it
 * in.
 *
 * A refused background permission is likewise not a failure: foreground sharing
 * still works.
 */
export async function startSharing(
  userId: string,
  groupId: string
): Promise<SharingChangeResult> {
  const enabled = await enableLocationSharing(userId, groupId);
  if (!enabled.success) {
    return { success: false, error: enabled.error };
  }

  const location = await getCurrentLocation();
  if (location.success && location.coordinates) {
    await updateMyLocation(userId, groupId, location.coordinates);
  }

  const backgroundRunning = await startBackgroundLocationUpdates();

  return { success: true, backgroundRunning };
}

/**
 * Stop sharing with one group.
 *
 * disableLocationSharing() deletes the stored position, so this is a genuine
 * stop rather than a hide. The background task is stopped only once nothing is
 * shared anywhere: sharing is per group, and one task serves all of them.
 */
export async function stopSharing(
  userId: string,
  groupId: string
): Promise<SharingChangeResult> {
  const disabled = await disableLocationSharing(userId, groupId);
  if (!disabled.success) {
    return { success: false, error: disabled.error };
  }

  const backgroundRunning = await stopBackgroundIfNothingShared(userId);

  return { success: true, backgroundRunning };
}

/**
 * Stop sharing with everyone.
 *
 * A partial failure is reported as one -- see pauseAllSharing(). The background
 * task is still stopped if nothing is left being shared, so a half-failure does
 * not also leave the task running for no reason.
 */
export async function stopAllSharing(
  userId: string
): Promise<SharingChangeResult> {
  const paused = await pauseAllSharing(userId);
  const backgroundRunning = await stopBackgroundIfNothingShared(userId);

  if (!paused.success) {
    return { success: false, error: paused.error, backgroundRunning };
  }

  return { success: true, backgroundRunning };
}

/**
 * Stop the background task if the user is no longer sharing with anything.
 *
 * Returns whether it is still running afterwards. If the check itself fails, the
 * task is left alone: guessing wrong towards "stop" would silently break sharing
 * the user still wants.
 */
async function stopBackgroundIfNothingShared(userId: string): Promise<boolean> {
  const remaining = await getMySharingGroupIds(userId);

  if (!remaining.success || !remaining.groupIds) {
    return true;
  }

  if (remaining.groupIds.length === 0) {
    await stopBackgroundLocationUpdates();
    return false;
  }

  return true;
}
