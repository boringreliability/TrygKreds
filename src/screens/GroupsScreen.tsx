/**
 * Groups Screen
 *
 * Displays the user's groups and options to create/join groups.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { getMyGroups, type GroupWithRole } from '../domain/groups';

interface GroupsScreenProps {
  onCreateGroup?: () => void;
  onJoinGroup?: () => void;
  onSelectGroup?: (group: GroupWithRole) => void;
}

export function GroupsScreen({
  onCreateGroup,
  onJoinGroup,
  onSelectGroup,
}: GroupsScreenProps) {
  const { user, signOut } = useAuth();
  const [groups, setGroups] = useState<GroupWithRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadGroups = useCallback(async () => {
    if (!user) return;

    const result = await getMyGroups(user.id);
    if (result.success && result.groups) {
      setGroups(result.groups);
    }
  }, [user]);

  useEffect(() => {
    const init = async () => {
      await loadGroups();
      setIsLoading(false);
    };
    init();
  }, [loadGroups]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadGroups();
    setIsRefreshing(false);
  };

  const renderGroup = ({ item }: { item: GroupWithRole }) => (
    <TouchableOpacity
      style={styles.groupItem}
      onPress={() => onSelectGroup?.(item)}
    >
      <View style={styles.groupIcon}>
        <Text style={styles.groupIconText}>
          {item.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.groupInfo}>
        <Text style={styles.groupName}>{item.name}</Text>
        <Text style={styles.groupRole}>
          {item.role === 'owner' ? 'Owner' : 'Member'}
        </Text>
      </View>
      <Text style={styles.groupArrow}>›</Text>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>👥</Text>
      <Text style={styles.emptyText}>You&apos;re not in any groups yet</Text>
      <Text style={styles.emptySubtext}>
        Create a group or join one with an invite code
      </Text>
    </View>
  );

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
        <Text style={styles.title}>My Groups</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      {groups.length > 0 ? (
        <FlatList
          data={groups}
          renderItem={renderGroup}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#4F46E5"
            />
          }
        />
      ) : (
        <View style={styles.content}>{renderEmpty()}</View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryButton} onPress={onCreateGroup}>
          <Text style={styles.primaryButtonText}>Create Group</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={onJoinGroup}>
          <Text style={styles.secondaryButtonText}>Join Group</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
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
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111',
  },
  email: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  listContent: {
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    marginBottom: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  groupIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupIconText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  groupInfo: {
    flex: 1,
    marginLeft: 16,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  groupRole: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  groupArrow: {
    fontSize: 24,
    color: '#ccc',
  },
  actions: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  primaryButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#4F46E5',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  signOutButton: {
    alignItems: 'center',
    padding: 12,
  },
  signOutText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '500',
  },
});
