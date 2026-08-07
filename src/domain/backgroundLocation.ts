/**
 * Background location decision logic.
 *
 * This module has NO imports -- not expo, not react-native, not even the
 * Supabase client. Everything here is arithmetic over plain values, so the rules
 * that decide whether to spend battery and write a row can be tested as
 * arithmetic rather than through a device. A test in backgroundLocation.test.ts
 * asserts that this stays true.
 *
 * The I/O that surrounds it lives in:
 *   - src/domain/backgroundLocationSync.ts -- reads and writes via Supabase
 *   - src/services/backgroundLocation.ts   -- the Expo task and permissions
 */

/**
 * Accuracy expressed in our own terms rather than Expo's enum, so that this
 * module stays platform-free. The service layer maps it.
 */
export type LocationAccuracy =
  'lowest' | 'low' | 'balanced' | 'high' | 'highest';

export interface BackgroundLocationConfig {
  /** Never send updates closer together than this, however far the user moved. */
  minIntervalMs: number;
  /** Never send an update for a movement smaller than this. */
  minDistanceMeters: number;
  /** Discard fixes less accurate than this, in metres. */
  maxAccuracyMeters: number;
  /** What to ask the platform for. */
  accuracy: LocationAccuracy;
}

/**
 * The single place these numbers are defined.
 *
 * Battery is a product requirement here, not an optimisation, and every value is
 * chosen to send as few updates as the feature can get away with:
 *
 * - `accuracy: 'balanced'` rather than 'highest'. Highest keeps the GPS chip
 *   awake and is the largest drain available to this app. Balanced is roughly
 *   city-block accurate and resolves from wifi and cell towers most of the time,
 *   which is what "roughly where is my family" actually needs. A parent looking
 *   at a map does not need three metres.
 * - `minIntervalMs: 5 minutes`. A hard floor. Even a phone in a moving car will
 *   write at most twelve rows an hour.
 * - `minDistanceMeters: 100`. Below this, a "movement" is usually the fix
 *   drifting while the phone sits on a table.
 * - `maxAccuracyMeters: 250`. A fix accurate to two kilometres is worse than
 *   showing nothing: it puts a marker on a street the person has never been on.
 */
export const BACKGROUND_LOCATION_CONFIG: BackgroundLocationConfig = {
  minIntervalMs: 5 * 60 * 1000,
  minDistanceMeters: 100,
  maxAccuracyMeters: 250,
  accuracy: 'balanced',
};

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface LocationFix extends Coordinates {
  /** Metres. null or undefined when the platform did not report it. */
  accuracy?: number | null;
  /** Epoch milliseconds. */
  timestamp: number;
}

export interface LastSentPosition extends Coordinates {
  /** Epoch milliseconds when this position was last written. */
  sentAt: number;
}

export type UpdateDecisionReason =
  'first-fix' | 'moved' | 'too-soon' | 'not-moved' | 'inaccurate' | 'invalid';

export interface UpdateDecision {
  send: boolean;
  reason: UpdateDecisionReason;
  /** Metres moved since the last sent position, when there was one. */
  distanceMeters?: number;
}

export interface ShouldSendUpdateParams {
  /** The position currently stored for this user and group, if any. */
  lastSent: LastSentPosition | null;
  current: LocationFix;
  config: BackgroundLocationConfig;
  /** Epoch milliseconds. Passed in rather than read, so this stays pure. */
  now: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function areValidCoordinates({ latitude, longitude }: Coordinates): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Great-circle distance in metres (haversine).
 *
 * Haversine rather than a flat approximation because the latter misbehaves at
 * the antimeridian, where a small step reads as most of the way round the
 * planet -- and a false "moved 20,000 km" would trigger an update every time.
 */
export function distanceBetweenMeters(a: Coordinates, b: Coordinates): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(b.longitude - a.longitude);

  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Whether a fix is worth sending.
 *
 * The order of the checks is the behaviour:
 *
 *   1. Nonsense coordinates are dropped first -- they are the most fundamental
 *      problem, and reporting anything else would be misleading.
 *   2. Then accuracy, because a bad fix should not reset the interval or count
 *      as movement.
 *   3. The first fix is always sent: with nothing stored there is no interval to
 *      respect and nothing to compare against.
 *   4. The interval is a hard floor, checked before distance. However far
 *      someone has moved, we do not write more often than this.
 *   5. Finally distance, so a phone sitting still writes nothing.
 */
export function shouldSendUpdate({
  lastSent,
  current,
  config,
  now,
}: ShouldSendUpdateParams): UpdateDecision {
  if (!areValidCoordinates(current)) {
    return { send: false, reason: 'invalid' };
  }

  const accuracy = current.accuracy;
  // A missing accuracy is unknown, not bad. Discarding those would mean sending
  // nothing at all on a platform that does not report it.
  if (
    accuracy !== null &&
    accuracy !== undefined &&
    Number.isFinite(accuracy) &&
    accuracy > config.maxAccuracyMeters
  ) {
    return { send: false, reason: 'inaccurate' };
  }

  if (!lastSent) {
    return { send: true, reason: 'first-fix' };
  }

  // Comparing elapsed against the floor this way also handles a clock that
  // moved backwards: a negative elapsed time is "too soon", never "overdue".
  const elapsedMs = now - lastSent.sentAt;
  if (!(elapsedMs >= config.minIntervalMs)) {
    return { send: false, reason: 'too-soon' };
  }

  const distanceMeters = distanceBetweenMeters(lastSent, current);
  if (distanceMeters < config.minDistanceMeters) {
    return { send: false, reason: 'not-moved', distanceMeters };
  }

  return { send: true, reason: 'moved', distanceMeters };
}

export interface BackgroundGateParams {
  isSignedIn: boolean;
  /** How many groups the user is currently sharing their location with. */
  sharingGroupCount: number;
}

/**
 * The hard gate on doing any background work at all.
 *
 * Checked inside the task on every run, not only when it is registered. The OS
 * keeps a background task registered across app restarts, so it can easily
 * outlive the session that started it -- and a task that reads a position for a
 * signed-out user is exactly the behaviour this app exists to not have.
 */
export function canRunBackgroundUpdates({
  isSignedIn,
  sharingGroupCount,
}: BackgroundGateParams): boolean {
  return isSignedIn && sharingGroupCount > 0;
}
