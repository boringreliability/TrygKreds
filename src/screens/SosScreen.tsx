/**
 * SOS Screen
 *
 * Provides a panic button for emergencies and displays SOS history.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import {
  triggerSosForAllGroups,
  canTriggerSos,
  getSosEventsForGroup,
  getUserGroups,
  type SosEvent,
} from '../domain/sos';
import {
  getCurrentLocation,
  getForegroundPermissionStatus,
} from '../services/location';
import { sendSosNotification } from '../services/notification';

interface SosScreenProps {
  onBack?: () => void;
}

export function SosScreen({ onBack }: SosScreenProps) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [canTrigger, setCanTrigger] = useState(true);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [sosEvents, setSosEvents] = useState<SosEvent[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Check if user can trigger SOS
      const cooldownResult = await canTriggerSos(user.id);
      setCanTrigger(cooldownResult.canTrigger);
      setCooldownRemaining(cooldownResult.cooldownRemaining);

      // Get user's groups and load SOS events
      const { groupIds } = await getUserGroups(user.id);
      if (groupIds.length > 0) {
        const eventsResult = await getSosEventsForGroup(groupIds[0], 10);
        if (eventsResult.success && eventsResult.events) {
          setSosEvents(eventsResult.events);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownRemaining <= 0) return;

    const interval = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1000) {
          setCanTrigger(true);
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  const handleSosPress = async () => {
    if (!canTrigger) {
      return;
    }

    // Show confirmation dialog
    Alert.alert(
      'Trigger SOS',
      'This will send an emergency alert to all members of your groups. Are you sure?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {},
        },
        {
          text: 'Send SOS',
          style: 'destructive',
          onPress: handleConfirmSos,
        },
      ]
    );
  };

  const handleConfirmSos = async () => {
    if (!user?.id) return;

    setIsSending(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      // Try to get current location
      let coordinates = null;
      const permissionStatus = await getForegroundPermissionStatus();
      if (permissionStatus.status === 'granted') {
        const locationResult = await getCurrentLocation();
        if (locationResult.success && locationResult.coordinates) {
          coordinates = locationResult.coordinates;
        }
      }

      // Trigger SOS for all groups
      const result = await triggerSosForAllGroups(user.id, coordinates);

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to send SOS');
        return;
      }

      // Send notifications for each event
      if (result.events) {
        for (const event of result.events) {
          await sendSosNotification({
            sosEventId: event.id,
            triggerUserId: user.id,
            triggerUserName: user.email || 'Unknown',
            groupId: event.groupId,
            groupName: 'Group', // In a real app, we'd fetch the group name
            latitude: event.latitude,
            longitude: event.longitude,
          });
        }
      }

      setSuccessMessage(
        `SOS sent! ${result.events?.length || 0} group(s) notified.`
      );
      setCanTrigger(false);
      setCooldownRemaining(60000); // 1 minute cooldown

      // Reload data
      await loadData();
    } catch {
      setErrorMessage('Failed to send SOS. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (dateString: string): string => {
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

  const formatCooldown = (ms: number): string => {
    const seconds = Math.ceil(ms / 1000);
    return `${seconds}s`;
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#DC2626" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          {onBack && (
            <TouchableOpacity style={styles.backButton} onPress={onBack}>
              <Text style={styles.backButtonText}>‹ Back</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.title}>Emergency SOS</Text>
          <Text style={styles.subtitle}>
            Alert all your group members in case of emergency
          </Text>
        </View>

        <View style={styles.sosContainer}>
          <TouchableOpacity
            testID="sos-button"
            style={[
              styles.sosButton,
              !canTrigger && styles.sosButtonDisabled,
              isSending && styles.sosButtonSending,
            ]}
            onPress={handleSosPress}
            disabled={!canTrigger || isSending}
            accessibilityState={{ disabled: !canTrigger || isSending }}
          >
            {isSending ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : (
              <>
                <Text style={styles.sosButtonText}>SOS</Text>
                {!canTrigger && (
                  <Text style={styles.sosButtonSubtext}>
                    Please wait {formatCooldown(cooldownRemaining)}
                  </Text>
                )}
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.sosInstructions}>
            {canTrigger
              ? 'Press and confirm to send emergency alert'
              : `Please wait ${formatCooldown(cooldownRemaining)} before sending another SOS`}
          </Text>
        </View>

        {successMessage && (
          <View style={styles.successContainer}>
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        )}

        {errorMessage && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        <View style={styles.historyContainer}>
          <Text style={styles.historyTitle}>Recent SOS Events</Text>
          {sosEvents.length === 0 ? (
            <Text style={styles.emptyText}>No recent SOS events</Text>
          ) : (
            sosEvents.map((event) => (
              <View key={event.id} style={styles.historyItem}>
                <View style={styles.historyIcon}>
                  <Text style={styles.historyIconText}>!</Text>
                </View>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyTime}>
                    {formatTime(event.createdAt)}
                  </Text>
                  <Text style={styles.historyLocation}>
                    {event.latitude && event.longitude
                      ? `Location: ${event.latitude.toFixed(4)}, ${event.longitude.toFixed(4)}`
                      : 'No location data'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
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
    color: '#DC2626',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  sosContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  sosButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  sosButtonDisabled: {
    backgroundColor: '#9CA3AF',
    shadowColor: '#9CA3AF',
  },
  sosButtonSending: {
    backgroundColor: '#EF4444',
  },
  sosButtonText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
  },
  sosButtonSubtext: {
    fontSize: 14,
    color: '#fff',
    marginTop: 4,
  },
  sosInstructions: {
    fontSize: 14,
    color: '#666',
    marginTop: 20,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  successContainer: {
    backgroundColor: '#D1FAE5',
    padding: 16,
    marginHorizontal: 24,
    marginBottom: 16,
    borderRadius: 12,
  },
  successText: {
    color: '#059669',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    padding: 16,
    marginHorizontal: 24,
    marginBottom: 16,
    borderRadius: 12,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  historyContainer: {
    padding: 24,
    flex: 1,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 20,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyIconText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  historyInfo: {
    marginLeft: 12,
    flex: 1,
  },
  historyTime: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  historyLocation: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
});
