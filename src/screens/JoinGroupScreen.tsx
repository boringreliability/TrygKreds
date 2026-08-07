/**
 * Join Group Screen
 *
 * Allows users to join a group via invite code.
 */

import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { joinGroup } from '../domain/groups';

interface JoinGroupScreenProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function JoinGroupScreen({ onSuccess, onCancel }: JoinGroupScreenProps) {
  const { user } = useAuth();
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleJoin = async () => {
    setError(null);

    const trimmedCode = inviteCode.trim().toUpperCase();

    if (!trimmedCode) {
      setError('Invite code is required');
      return;
    }

    if (!user) {
      setError('You must be signed in to join a group');
      return;
    }

    setIsLoading(true);

    try {
      const result = await joinGroup(trimmedCode, user.id);

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || 'Failed to join group');
      }
    } catch (err) {
      console.error('Error joining group:', err);
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Join Group</Text>
        <Text style={styles.subtitle}>
          Enter the invite code shared by a group member
        </Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Invite code"
            placeholderTextColor="#999"
            value={inviteCode}
            onChangeText={(text) => setInviteCode(text.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={20}
            accessibilityLabel="Invite code"
            accessibilityHint="Enter the invite code shared by a group member"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleJoin}
            disabled={isLoading}
            accessibilityLabel={isLoading ? 'Joining group' : 'Join Group'}
            accessibilityHint="Joins the group using the entered invite code"
            accessibilityRole="button"
            accessibilityState={{ disabled: isLoading, busy: isLoading }}
          >
            {isLoading ? (
              <ActivityIndicator
                testID="loading-indicator"
                color="#fff"
                size="small"
              />
            ) : (
              <Text style={styles.buttonText}>Join Group</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            disabled={isLoading}
            accessibilityLabel="Cancel"
            accessibilityHint="Returns to the previous screen without joining a group"
            accessibilityRole="button"
            accessibilityState={{ disabled: isLoading }}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 32,
  },
  form: {
    gap: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 16,
    fontSize: 18,
    backgroundColor: '#f9f9f9',
    textAlign: 'center',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  button: {
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    padding: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },
  error: {
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center',
  },
});
