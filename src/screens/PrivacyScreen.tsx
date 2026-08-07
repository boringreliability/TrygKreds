/**
 * Privacy Screen
 *
 * Who can see your location, and how to stop it.
 *
 * There is deliberately no "resume everything" action. Restoring a remembered set
 * of groups could switch sharing back on for a group the user had turned off on
 * purpose -- a privacy control must never turn sharing ON by inference. Resuming
 * is always an explicit, per-group choice.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';

import { useAuth } from '../hooks/useAuth';
import { getMyVisibility, type GroupVisibility } from '../domain/privacy';
import { formatMemberName } from '../domain/profiles';
import {
  startSharing,
  stopSharing,
  stopAllSharing,
} from '../services/sharingControl';

interface PrivacyScreenProps {
  onBack?: () => void;
}

export function PrivacyScreen({ onBack }: PrivacyScreenProps) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupVisibility[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const [isPausingAll, setIsPausingAll] = useState(false);
  // Two separate slots on purpose. A reload after a failed pause must not wipe
  // the message explaining that the pause failed.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    const result = await getMyVisibility(user.id);

    if (result.success && result.groups) {
      setGroups(result.groups);
      setLoadError(null);
      setHasLoaded(true);
    } else {
      // Never fall back to showing "nobody can see you" -- saying that when we do
      // not know would be a reassuring lie. hasLoaded stays false, which is what
      // suppresses the summary below.
      setLoadError(result.error ?? 'Could not load your privacy settings');
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (group: GroupVisibility, next: boolean) => {
    if (!user?.id) return;

    setBusyGroupId(group.groupId);
    setActionError(null);

    try {
      const result = next
        ? await startSharing(user.id, group.groupId)
        : await stopSharing(user.id, group.groupId);

      if (!result.success) {
        setActionError(result.error ?? 'Could not change sharing');
      }

      // Re-read either way: the screen shows server state, not what we hoped for.
      await load();
    } finally {
      setBusyGroupId(null);
    }
  };

  const handlePauseAll = async () => {
    if (!user?.id) return;

    setIsPausingAll(true);
    setActionError(null);

    try {
      const result = await stopAllSharing(user.id);

      if (!result.success) {
        setActionError(result.error ?? 'Could not stop all sharing');
      }

      await load();
    } finally {
      setIsPausingAll(false);
    }
  };

  const sharingCount = groups.filter((group) => group.sharingEnabled).length;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer} testID="privacy-loading">
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity
            testID="privacy-back-button"
            style={styles.backButton}
            onPress={onBack}
          >
            <Text style={styles.backButtonText}>‹ Back</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.title}>Privacy</Text>
        <Text style={styles.subtitle} testID="privacy-summary">
          {!hasLoaded
            ? 'Could not check who can see you.'
            : sharingCount === 0
              ? 'You are not sharing your location with anyone.'
              : `You are sharing your location with ${sharingCount} ${
                  sharingCount === 1 ? 'group' : 'groups'
                }.`}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true);
              load();
            }}
            tintColor="#4F46E5"
          />
        }
      >
        {(actionError ?? loadError) && (
          <View style={styles.errorContainer}>
            <Text testID="privacy-error" style={styles.errorText}>
              {actionError ?? loadError}
            </Text>
          </View>
        )}

        {hasLoaded && groups.length === 0 ? (
          <Text testID="privacy-empty" style={styles.emptyText}>
            You are not a member of any group, so nobody can see your location.
          </Text>
        ) : (
          groups.map((group) => (
            <View
              key={group.groupId}
              style={styles.groupCard}
              testID={`privacy-group-${group.groupId}`}
            >
              <View style={styles.groupHeader}>
                <View style={styles.groupInfo}>
                  <Text style={styles.groupName}>{group.groupName}</Text>
                  <Text style={styles.groupState}>
                    {group.sharingEnabled
                      ? `${group.viewers.length} ${
                          group.viewers.length === 1 ? 'person' : 'people'
                        } can see you`
                      : 'Not shared'}
                  </Text>
                </View>
                <Switch
                  testID={`privacy-toggle-${group.groupId}`}
                  value={group.sharingEnabled}
                  onValueChange={(next) => handleToggle(group, next)}
                  disabled={busyGroupId === group.groupId || isPausingAll}
                  trackColor={{ false: '#E5E7EB', true: '#818CF8' }}
                  thumbColor={group.sharingEnabled ? '#4F46E5' : '#f4f4f4'}
                />
              </View>

              {group.sharingEnabled && group.viewers.length > 0 && (
                <View style={styles.viewerList}>
                  {group.viewers.map((viewer) => (
                    <Text
                      key={viewer.userId}
                      style={styles.viewerName}
                      testID={`privacy-viewer-${viewer.userId}`}
                    >
                      {/* Never a raw user id, even when no name is set. */}
                      {formatMemberName(viewer.displayName, false)}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          ))
        )}

        {sharingCount > 0 && (
          <TouchableOpacity
            testID="pause-all-button"
            style={[
              styles.pauseAllButton,
              isPausingAll && styles.buttonDisabled,
            ]}
            onPress={handlePauseAll}
            disabled={isPausingAll}
          >
            {isPausingAll ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.pauseAllText}>
                Stop sharing with everyone
              </Text>
            )}
          </TouchableOpacity>
        )}

        <Text style={styles.footnote}>
          Turning sharing off deletes your stored position. It is not just
          hidden.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    paddingVertical: 4,
  },
  backButtonText: {
    color: '#4F46E5',
    fontSize: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111827',
    marginTop: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    marginTop: 4,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
  },
  emptyText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 32,
    paddingHorizontal: 24,
    lineHeight: 22,
  },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupInfo: {
    flex: 1,
    marginRight: 12,
  },
  groupName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  groupState: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  viewerList: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  viewerName: {
    fontSize: 15,
    color: '#374151',
    paddingVertical: 3,
  },
  pauseAllButton: {
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  pauseAllText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footnote: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 19,
  },
});
