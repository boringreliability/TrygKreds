/**
 * Background Location Task Handler
 *
 * Defines and handles the background location task.
 * This module is separate to avoid circular dependencies
 * and to allow proper task registration at app startup.
 */

import * as TaskManager from 'expo-task-manager';
import { BACKGROUND_LOCATION_TASK } from './backgroundLocation';
import { updateMyLocation, type LocationCoordinates } from '../domain/location';
import {
  shouldSendLocationUpdate,
  getBackgroundConfig,
  type LocationUpdateContext,
  type Coordinates,
} from '../domain/backgroundLocation';
import { supabase } from './supabase';

// In-memory state for tracking updates (will be persisted to AsyncStorage in production)
interface BackgroundLocationState {
  lastUpdateTimestamp: number | null;
  lastCoordinates: Coordinates | null;
  isLowPowerMode: boolean;
}

let backgroundState: BackgroundLocationState = {
  lastUpdateTimestamp: null,
  lastCoordinates: null,
  isLowPowerMode: false,
};

/**
 * Update the background state
 */
export function updateBackgroundState(
  updates: Partial<BackgroundLocationState>
): void {
  backgroundState = { ...backgroundState, ...updates };
}

/**
 * Get current background state
 */
export function getBackgroundState(): BackgroundLocationState {
  return { ...backgroundState };
}

/**
 * Reset background state
 */
export function resetBackgroundState(): void {
  backgroundState = {
    lastUpdateTimestamp: null,
    lastCoordinates: null,
    isLowPowerMode: false,
  };
}

/**
 * Set low power mode
 */
export function setLowPowerMode(enabled: boolean): void {
  backgroundState.isLowPowerMode = enabled;
}

interface LocationData {
  locations: Array<{
    coords: {
      latitude: number;
      longitude: number;
      accuracy: number | null;
    };
    timestamp: number;
  }>;
}

/**
 * Process a location update from the background task
 */
export async function processBackgroundLocation(
  data: LocationData
): Promise<void> {
  if (!data.locations || data.locations.length === 0) {
    return;
  }

  const location = data.locations[data.locations.length - 1];
  const currentCoordinates: Coordinates = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };

  // Get current user session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return;
  }

  // Get user's groups with sharing enabled
  const { data: sharingSettings } = await supabase
    .from('location_sharing_settings')
    .select('group_id')
    .eq('user_id', session.user.id)
    .eq('sharing_enabled', true);

  const sharingEnabled = (sharingSettings?.length ?? 0) > 0;

  // Build context for update decision
  const context: LocationUpdateContext = {
    sharingEnabled,
    lastUpdateTimestamp: backgroundState.lastUpdateTimestamp,
    lastCoordinates: backgroundState.lastCoordinates,
    currentCoordinates,
    isLowPowerMode: backgroundState.isLowPowerMode,
  };

  const config = getBackgroundConfig();
  const decision = shouldSendLocationUpdate(context, config);

  if (!decision.shouldUpdate) {
    return;
  }

  // Update location for all groups with sharing enabled
  const coordinates: LocationCoordinates = {
    latitude: currentCoordinates.latitude,
    longitude: currentCoordinates.longitude,
    accuracy: location.coords.accuracy ?? 0,
  };

  for (const setting of sharingSettings || []) {
    await updateMyLocation(session.user.id, setting.group_id, coordinates);
  }

  // Update background state
  updateBackgroundState({
    lastUpdateTimestamp: Date.now(),
    lastCoordinates: currentCoordinates,
  });
}

/**
 * Define the background location task
 * This should be called at app startup, outside of any component
 */
export function defineBackgroundLocationTask(): void {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      console.error('Background location error:', error);
      return;
    }

    if (data) {
      await processBackgroundLocation(data as LocationData);
    }
  });
}
