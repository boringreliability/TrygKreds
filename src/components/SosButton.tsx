/**
 * SOS Button
 *
 * A prominent panic button with a single confirmation step.
 *
 * The confirmation costs exactly one extra tap. A guard that takes four taps is a
 * guard that fails in the emergency it exists for, so the dialog has two options
 * and the destructive one is the default-styled action.
 */

import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from 'react-native';

import { triggerSos } from '../domain/sos';

interface SosButtonProps {
  /** Called after an SOS was recorded, whether or not the alert was delivered. */
  onSent?: (notified: boolean) => void;
}

export function SosButton({ onSent }: SosButtonProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsSending(true);
    setError(null);
    setStatus(null);

    try {
      const result = await triggerSos();

      if (!result.success) {
        setError(result.error ?? 'Could not send SOS');
        return;
      }

      setIsConfirming(false);

      // Be honest about a partial outcome. The event is recorded either way, so
      // the people who open the app will see it -- but saying "sent" when the
      // relay was down would be a lie at the worst possible moment.
      setStatus(
        result.notified
          ? 'SOS sent to your groups.'
          : 'SOS recorded, but the alert may not have been delivered. Your groups will see it when they open the app.'
      );

      onSent?.(result.notified ?? false);
    } finally {
      setIsSending(false);
    }
  };

  const handleCancel = () => {
    setIsConfirming(false);
    setError(null);
  };

  return (
    <View>
      <TouchableOpacity
        testID="sos-button"
        style={styles.sosButton}
        onPress={() => {
          setStatus(null);
          setIsConfirming(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Send SOS to your groups"
      >
        <Text style={styles.sosButtonText}>SOS</Text>
      </TouchableOpacity>

      {status && (
        <Text testID="sos-status" style={styles.statusText}>
          {status}
        </Text>
      )}

      <Modal
        visible={isConfirming}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}
      >
        <View style={styles.backdrop}>
          <View style={styles.dialog} testID="sos-confirm-dialog">
            <Text style={styles.dialogTitle}>Send SOS?</Text>
            <Text style={styles.dialogBody}>
              Everyone in your groups will be alerted and shown your last known
              location.
            </Text>

            {error && (
              <Text testID="sos-error" style={styles.errorText}>
                {error}
              </Text>
            )}

            {/* One tap to confirm. No slider, no hold-to-activate. */}
            <TouchableOpacity
              testID="sos-confirm-button"
              style={[styles.confirmButton, isSending && styles.buttonDisabled]}
              onPress={handleConfirm}
              disabled={isSending}
            >
              {isSending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmButtonText}>Send SOS</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              testID="sos-cancel-button"
              style={styles.cancelButton}
              onPress={handleCancel}
              disabled={isSending}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  sosButton: {
    backgroundColor: '#DC2626',
    borderRadius: 999,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DC2626',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  sosButtonText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 2,
  },
  statusText: {
    marginTop: 12,
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  dialogBody: {
    fontSize: 15,
    color: '#4B5563',
    lineHeight: 21,
    marginBottom: 20,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
    marginBottom: 16,
  },
  confirmButton: {
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelButtonText: {
    color: '#6B7280',
    fontSize: 16,
  },
});
