/**
 * Group Map Screen
 *
 * Displays group member locations on a map with location sharing controls.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Switch,
  Alert,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { useAuth } from '../hooks/useAuth';
import {
  getGroupMemberLocations,
  getLocationSharingStatus,
  enableLocationSharing,
  disableLocationSharing,
  updateMyLocation,
  removeMyLocation,
  type MemberLocation,
} from '../domain/location';
import {
  requestForegroundPermission,
  getCurrentLocation,
  getForegroundPermissionStatus,
} from '../services/location';

interface GroupMapScreenProps {
  groupId: string;
  groupName: string;
  onBack?: () => void;
}

// Default region (Copenhagen, Denmark)
const DEFAULT_REGION: Region = {
  latitude: 55.6761,
  longitude: 12.5683,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

export function GroupMapScreen({
  groupId,
  groupName,
  onBack,
}: GroupMapScreenProps) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [locations, setLocations] = useState<MemberLocation[]>([]);
  const [isSharingEnabled, setIsSharingEnabled] = useState(false);
  const [isTogglingSharing, setIsTogglingSharing] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [mapRegion, setMapRegion] = useState<Region>(DEFAULT_REGION);

  const loadData = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Load sharing status and member locations in parallel
      const [statusResult, locationsResult] = await Promise.all([
        getLocationSharingStatus(user.id, groupId),
        getGroupMemberLocations(groupId),
      ]);

      if (statusResult.success && statusResult.status) {
        setIsSharingEnabled(statusResult.status.sharingEnabled);
      }

      if (locationsResult.success && locationsResult.locations) {
        setLocations(locationsResult.locations);

        // Center map on first location if available
        if (locationsResult.locations.length > 0) {
          const firstLocation = locationsResult.locations[0];
          setMapRegion({
            latitude: firstLocation.latitude,
            longitude: firstLocation.longitude,
            latitudeDelta: 0.0922,
            longitudeDelta: 0.0421,
          });
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, groupId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleSharing = async (value: boolean) => {
    if (!user?.id) return;

    setIsTogglingSharing(true);
    setPermissionError(null);

    try {
      if (value) {
        // Enabling sharing - check/request permission first
        const currentPermission = await getForegroundPermissionStatus();

        if (currentPermission.status !== 'granted') {
          const permission = await requestForegroundPermission();

          if (permission.status !== 'granted') {
            setPermissionError(
              'Location permission is required to share your location with group members.'
            );
            setIsTogglingSharing(false);
            return;
          }
        }

        // Enable sharing in database
        const enableResult = await enableLocationSharing(user.id, groupId);
        if (!enableResult.success) {
          Alert.alert('Error', enableResult.error || 'Failed to enable sharing');
          setIsTogglingSharing(false);
          return;
        }

        // Get and send current location
        const locationResult = await getCurrentLocation();
        if (locationResult.success && locationResult.coordinates) {
          await updateMyLocation(user.id, groupId, locationResult.coordinates);
        }

        setIsSharingEnabled(true);
      } else {
        // Disabling sharing
        await disableLocationSharing(user.id, groupId);
        await removeMyLocation(user.id, groupId);
        setIsSharingEnabled(false);
      }

      // Reload locations after change
      await loadData();
    } finally {
      setIsTogglingSharing(false);
    }
  };

  const handleRefreshLocation = async () => {
    if (!user?.id || !isSharingEnabled) return;

    setIsTogglingSharing(true);
    try {
      const locationResult = await getCurrentLocation();
      if (locationResult.success && locationResult.coordinates) {
        await updateMyLocation(user.id, groupId, locationResult.coordinates);
        await loadData();
      } else {
        Alert.alert('Error', locationResult.error || 'Failed to get location');
      }
    } finally {
      setIsTogglingSharing(false);
    }
  };

  const formatLastSeen = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>‹ Back</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.title}>{groupName}</Text>
        <Text style={styles.subtitle}>
          {locations.length} member{locations.length !== 1 ? 's' : ''} sharing
        </Text>
      </View>

      <View style={styles.mapContainer}>
        <MapView
          testID="map-view"
          style={styles.map}
          region={mapRegion}
          onRegionChangeComplete={setMapRegion}
        >
          {locations.map((location) => (
            <Marker
              key={location.id}
              testID={`marker-${location.latitude}`}
              coordinate={{
                latitude: location.latitude,
                longitude: location.longitude,
              }}
              title={location.userId === user?.id ? 'You' : 'Member'}
              description={`Last seen: ${formatLastSeen(location.updatedAt)}`}
            />
          ))}
        </MapView>
      </View>

      <View style={styles.controls}>
        <View style={styles.sharingRow}>
          <View style={styles.sharingInfo}>
            <Text style={styles.sharingLabel}>Share my location</Text>
            <Text style={styles.sharingDescription}>
              {isSharingEnabled
                ? 'Your location is visible to group members'
                : 'Your location is hidden'}
            </Text>
          </View>
          <Switch
            testID="location-sharing-toggle"
            value={isSharingEnabled}
            onValueChange={handleToggleSharing}
            disabled={isTogglingSharing}
            trackColor={{ false: '#E5E7EB', true: '#818CF8' }}
            thumbColor={isSharingEnabled ? '#4F46E5' : '#f4f4f4'}
          />
        </View>

        {permissionError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{permissionError}</Text>
          </View>
        )}

        {isSharingEnabled && (
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleRefreshLocation}
            disabled={isTogglingSharing}
          >
            <Text style={styles.refreshButtonText}>
              {isTogglingSharing ? 'Updating...' : 'Update My Location'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {locations.length > 0 && (
        <View style={styles.membersList}>
          <Text style={styles.membersTitle}>Last seen</Text>
          {locations.map((location) => (
            <View key={location.id} style={styles.memberItem}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>
                  {location.userId === user?.id ? 'Y' : 'M'}
                </Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>
                  {location.userId === user?.id ? 'You' : 'Member'}
                </Text>
                <Text style={styles.memberLastSeen}>
                  Last seen: {formatLastSeen(location.updatedAt)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    marginBottom: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#4F46E5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  mapContainer: {
    flex: 1,
    minHeight: 200,
  },
  map: {
    flex: 1,
  },
  controls: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  sharingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sharingInfo: {
    flex: 1,
    marginRight: 16,
  },
  sharingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  sharingDescription: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
  refreshButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  refreshButtonText: {
    color: '#4F46E5',
    fontSize: 15,
    fontWeight: '600',
  },
  membersList: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    maxHeight: 150,
  },
  membersTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  memberInfo: {
    marginLeft: 12,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
  },
  memberLastSeen: {
    fontSize: 12,
    color: '#666',
  },
});
