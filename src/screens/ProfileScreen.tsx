/**
 * Profile Screen
 *
 * Lets the user choose the display name their group members see.
 *
 * The name is user-chosen and need not be a real name -- the copy on this
 * screen says so, because a family safety app should not imply otherwise.
 */

import { useCallback, useEffect, useState } from 'react';
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
import {
  getMyProfile,
  setMyDisplayName,
  validateDisplayName,
  MAX_DISPLAY_NAME_LENGTH,
} from '../domain/profiles';

interface ProfileScreenProps {
  onSaved?: () => void;
  onCancel?: () => void;
}

export function ProfileScreen({ onSaved, onCancel }: ProfileScreenProps) {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const result = await getMyProfile(user.id);

    if (result.success && result.profile) {
      setDisplayName(result.profile.displayName ?? '');
    }

    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSave = async () => {
    setError(null);
    setSavedMessage(null);

    // Validate before going near the network, so an empty or over-long name is
    // rejected without a round trip.
    const validation = validateDisplayName(displayName);
    if (!validation.isValid) {
      setError(validation.error || 'Invalid display name');
      return;
    }

    if (!user) {
      setError('You must be signed in to set a display name');
      return;
    }

    setIsSaving(true);

    try {
      const result = await setMyDisplayName(user.id, displayName);

      if (result.success) {
        setDisplayName(result.profile?.displayName ?? displayName.trim());
        setSavedMessage('Display name saved');
        onSaved?.();
      } else {
        setError(result.error || 'Failed to save display name');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer} testID="profile-loading">
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Your display name</Text>
        <Text style={styles.subtitle}>
          This is what your group members see on the map. It does not have to be
          your real name.
        </Text>

        <TextInput
          testID="display-name-input"
          style={styles.input}
          value={displayName}
          onChangeText={(text) => {
            setDisplayName(text);
            setError(null);
            setSavedMessage(null);
          }}
          placeholder="e.g. Mor"
          placeholderTextColor="#9CA3AF"
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          autoCapitalize="words"
          autoCorrect={false}
          editable={!isSaving}
        />

        {error && (
          <View style={styles.errorContainer}>
            <Text testID="profile-error" style={styles.errorText}>
              {error}
            </Text>
          </View>
        )}

        {savedMessage && (
          <Text testID="profile-saved" style={styles.savedText}>
            {savedMessage}
          </Text>
        )}

        <TouchableOpacity
          testID="save-display-name-button"
          style={[styles.button, isSaving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Save</Text>
          )}
        </TouchableOpacity>

        {onCancel && (
          <TouchableOpacity
            testID="profile-cancel-button"
            style={styles.cancelButton}
            onPress={onCancel}
            disabled={isSaving}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 24,
    lineHeight: 21,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    marginBottom: 16,
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
  savedText: {
    color: '#047857',
    fontSize: 14,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    color: '#6B7280',
    fontSize: 16,
  },
});
