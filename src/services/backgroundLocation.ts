/**
 * Background Location Service
 *
 * Manages background location updates using Expo Location and TaskManager.
 * Handles permission requests, task lifecycle, and configuration.
 */

import * as ExpoLocation from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getBackgroundConfig } from '../domain/backgroundLocation';

export const BACKGROUND_LOCATION_TASK = 'background-location-task';

export type BackgroundPermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface BackgroundPermissionResult {
  status: BackgroundPermissionStatus;
  canAskAgain: boolean;
}

export interface BackgroundServiceResult {
  success: boolean;
  error?: string;
}

export interface BackgroundLocationOptions {
  lowPowerMode?: boolean;
}

/**
 * Request background location permission
 */
export async function requestBackgroundPermission(): Promise<BackgroundPermissionResult> {
  const { status, canAskAgain } =
    await ExpoLocation.requestBackgroundPermissionsAsync();
  return {
    status: status as BackgroundPermissionStatus,
    canAskAgain,
  };
}

/**
 * Check current background location permission status
 */
export async function getBackgroundPermissionStatus(): Promise<BackgroundPermissionResult> {
  const { status, canAskAgain } =
    await ExpoLocation.getBackgroundPermissionsAsync();
  return {
    status: status as BackgroundPermissionStatus,
    canAskAgain,
  };
}

/**
 * Start background location updates
 */
export async function startBackgroundLocationUpdates(
  options: BackgroundLocationOptions = {}
): Promise<BackgroundServiceResult> {
  try {
    // Check permission first
    const permission = await getBackgroundPermissionStatus();
    if (permission.status !== 'granted') {
      return {
        success: false,
        error: 'Background location permission not granted',
      };
    }

    const config = getBackgroundConfig();

    await ExpoLocation.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: options.lowPowerMode
        ? ExpoLocation.Accuracy.Low
        : ExpoLocation.Accuracy.Balanced,
      distanceInterval: config.minDistanceMeters,
      timeInterval: options.lowPowerMode
        ? config.lowPowerMinIntervalMs
        : config.minIntervalMs,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'TrygKreds',
        notificationBody: 'Sharing your location with your groups',
        notificationColor: '#4A90A4',
      },
      activityType: ExpoLocation.ActivityType.Other,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start background location',
    };
  }
}

/**
 * Stop background location updates
 */
export async function stopBackgroundLocationUpdates(): Promise<BackgroundServiceResult> {
  try {
    const isRunning = await isBackgroundLocationRunning();
    if (!isRunning) {
      return { success: true };
    }

    await ExpoLocation.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop background location',
    };
  }
}

/**
 * Check if background location updates are currently running
 */
export async function isBackgroundLocationRunning(): Promise<boolean> {
  return await ExpoLocation.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK
  );
}

/**
 * Check if the background task is registered
 */
export async function isBackgroundTaskRegistered(): Promise<boolean> {
  return await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
}
