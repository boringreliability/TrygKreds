/**
 * Background location sync.
 *
 * The I/O half of Ward 4: reads the gate and the stored positions, asks
 * backgroundLocation.ts whether a fix is worth sending, and upserts the ones
 * that are.
 *
 * It imports no platform code either -- the Expo task lives in
 * src/services/backgroundLocation.ts and hands a plain fix to this function --
 * so the gate and the wiring can be tested with nothing but Supabase mocks.
 */

import { getCurrentUser } from './auth';
import {
  getMySharingGroupIds,
  getMyStoredPositions,
  updateMyLocation,
} from './location';
import {
  BACKGROUND_LOCATION_CONFIG,
  canRunBackgroundUpdates,
  shouldSendUpdate,
  type BackgroundLocationConfig,
  type LocationFix,
  type UpdateDecisionReason,
} from './backgroundLocation';

export type BackgroundSyncSkipReason =
  'signed-out' | 'not-sharing' | 'lookup-failed';

export interface BackgroundSyncResult {
  /** False when the gate refused, or a lookup it depends on failed. */
  ran: boolean;
  reason?: BackgroundSyncSkipReason;
  /** Groups whose stored position was overwritten. */
  updated: string[];
  /** Groups deliberately left alone, with the rule that decided it. */
  skipped: { groupId: string; reason: UpdateDecisionReason }[];
  /** Groups where the write was attempted and failed. */
  failed: { groupId: string; error: string }[];
}

export interface SyncOptions {
  /** Epoch milliseconds. Injected so the decision stays deterministic in tests. */
  now?: number;
  config?: BackgroundLocationConfig;
}

function refused(reason: BackgroundSyncSkipReason): BackgroundSyncResult {
  return { ran: false, reason, updated: [], skipped: [], failed: [] };
}

/**
 * Process one background fix.
 *
 * Order matters. The gate comes first and short-circuits: a signed-out user
 * causes no query beyond the session check, and a user sharing with nobody
 * causes no read of stored positions. Doing the cheap refusals first is what
 * makes a disabled background task nearly free.
 */
export async function syncBackgroundLocation(
  fix: LocationFix,
  options: SyncOptions = {}
): Promise<BackgroundSyncResult> {
  const now = options.now ?? Date.now();
  const config = options.config ?? BACKGROUND_LOCATION_CONFIG;

  // Gate, half one: is anyone signed in? Re-checked on every run, because the
  // OS keeps the task registered across app restarts and it can outlive the
  // session that registered it.
  const user = await getCurrentUser();
  if (!user) {
    return refused('signed-out');
  }

  // Gate, half two: is the user sharing with anybody at all?
  const sharing = await getMySharingGroupIds(user.id);
  if (!sharing.success || !sharing.groupIds) {
    return refused('lookup-failed');
  }

  if (
    !canRunBackgroundUpdates({
      isSignedIn: true,
      sharingGroupCount: sharing.groupIds.length,
    })
  ) {
    return refused('not-sharing');
  }

  // "When did I last send, and from where?" comes from the rows we are about to
  // overwrite. A failed read must not be mistaken for "nothing stored" -- that
  // would look like a first fix for every group and write on every single run.
  const stored = await getMyStoredPositions(user.id);
  if (!stored.success || !stored.positions) {
    return refused('lookup-failed');
  }

  const result: BackgroundSyncResult = {
    ran: true,
    updated: [],
    skipped: [],
    failed: [],
  };

  for (const groupId of sharing.groupIds) {
    const decision = shouldSendUpdate({
      lastSent: stored.positions[groupId] ?? null,
      current: fix,
      config,
      now,
    });

    if (!decision.send) {
      result.skipped.push({ groupId, reason: decision.reason });
      continue;
    }

    // updateMyLocation upserts against UNIQUE(user_id, group_id). It must stay
    // an upsert: an insert here would accumulate the location history this app
    // exists to avoid. See PRIVACY.md.
    const write = await updateMyLocation(user.id, groupId, {
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracy: fix.accuracy ?? 0,
    });

    if (write.success) {
      result.updated.push(groupId);
    } else {
      // One group failing is not a reason to abandon the others.
      result.failed.push({ groupId, error: write.error ?? 'Unknown error' });
    }
  }

  return result;
}
