/**
 * Background location service.
 *
 * The only part of Ward 4 that touches the platform. It registers the OS task,
 * maps our accuracy setting onto Expo's enum, and hands each fix to
 * syncBackgroundLocation() -- which owns every decision about whether to write.
 *
 * Keeping this layer thin is deliberate: it is the part that cannot be tested
 * without a device, so there should be as little of it as possible.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import {
  BACKGROUND_LOCATION_CONFIG,
  type LocationAccuracy,
} from '../domain/backgroundLocation';
import { syncBackgroundLocation } from '../domain/backgroundLocationSync';

/**
 * Task identifier. Stable across releases: the OS remembers registered tasks,
 * so renaming this would orphan an already-registered task on existing installs.
 */
export const BACKGROUND_LOCATION_TASK = 'trygkreds-background-location';

/** Maps our platform-free accuracy setting onto Expo's enum. */
function toExpoAccuracy(accuracy: LocationAccuracy): Location.Accuracy {
  switch (accuracy) {
    case 'lowest':
      return Location.Accuracy.Lowest;
    case 'low':
      return Location.Accuracy.Low;
    case 'balanced':
      return Location.Accuracy.Balanced;
    case 'high':
      return Location.Accuracy.High;
    case 'highest':
      return Location.Accuracy.Highest;
  }
}

interface LocationTaskData {
  locations?: Location.LocationObject[];
}

/**
 * Turn an Expo location object into the plain fix the domain layer expects.
 */
function toFix(location: Location.LocationObject) {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy,
    timestamp: location.timestamp,
  };
}

/**
 * Register the task handler.
 *
 * Must run at module load, before the OS can deliver an event -- a task can fire
 * into a cold start, where nothing else has run yet. Called from
 * src/services/registerBackgroundTasks.ts, which the root layout imports.
 */
export function defineBackgroundLocationTask(): void {
  if (TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
    return;
  }

  TaskManager.defineTask<LocationTaskData>(
    BACKGROUND_LOCATION_TASK,
    async ({ data, error }) => {
      if (error) {
        // Nothing useful to do with a task-level error, and no crash reporter to
        // send it to by design. Swallow it rather than let it surface as an
        // unhandled rejection in the background.
        return;
      }

      const locations = data?.locations;
      if (!locations || locations.length === 0) {
        return;
      }

      // The OS may batch several fixes. Only the newest can be the current
      // position, and writing the older ones would be writing history.
      const newest = locations.reduce((latest, candidate) =>
        candidate.timestamp > latest.timestamp ? candidate : latest
      );

      const result = await syncBackgroundLocation(toFix(newest));

      // The gate is inside syncBackgroundLocation, and it is authoritative. If it
      // refused because nobody is signed in or nobody is being shared with, the
      // task should not be running at all -- stop it rather than wake up again.
      if (!result.ran && result.reason !== 'lookup-failed') {
        await stopBackgroundLocationUpdates();
      }
    }
  );
}

/**
 * Ask for the background ("always") location permission.
 *
 * Foreground permission must already be granted; the OS refuses the background
 * one otherwise. Returns false rather than throwing, so a refusal is an ordinary
 * outcome the caller can act on.
 */
export async function requestBackgroundPermission(): Promise<boolean> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    return false;
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === 'granted';
}

export async function isBackgroundLocationRunning(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
}

/**
 * Start background updates, if permitted and not already running.
 *
 * The distance and interval below are what the OS uses to decide when to wake us
 * at all -- the cheapest possible filter, since a fix that never happens costs
 * nothing. shouldSendUpdate() then applies the same thresholds again to what
 * does arrive, because the OS treats them as hints rather than guarantees.
 */
export async function startBackgroundLocationUpdates(): Promise<boolean> {
  const granted = await requestBackgroundPermission();
  if (!granted) {
    return false;
  }

  if (await isBackgroundLocationRunning()) {
    return true;
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: toExpoAccuracy(BACKGROUND_LOCATION_CONFIG.accuracy),
    distanceInterval: BACKGROUND_LOCATION_CONFIG.minDistanceMeters,
    timeInterval: BACKGROUND_LOCATION_CONFIG.minIntervalMs,
    // Deferred updates let the OS batch fixes and wake the app less often. The
    // handler takes the newest of a batch, so batching costs nothing but saves
    // wake-ups.
    deferredUpdatesInterval: BACKGROUND_LOCATION_CONFIG.minIntervalMs,
    deferredUpdatesDistance: BACKGROUND_LOCATION_CONFIG.minDistanceMeters,
    // Android requires a visible notification for background location. Being
    // conspicuous is the honest choice here: the user should be able to see at a
    // glance that the app is sharing, and be one tap from turning it off.
    foregroundService: {
      notificationTitle: 'TrygKreds is sharing your location',
      notificationBody: 'Tap to open and stop sharing.',
      notificationColor: '#4F46E5',
    },
    pausesUpdatesAutomatically: false,
  });

  return true;
}

export async function stopBackgroundLocationUpdates(): Promise<void> {
  if (await isBackgroundLocationRunning()) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}
