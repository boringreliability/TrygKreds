import { useEffect } from 'react';
import { Alert } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/hooks/useAuth';
import { subscribeToAuthLinks } from '../src/services/authLink';
// Imported for its side effect: defines the background location task handler at
// module load, so a background event delivered into a cold start finds it.
import '../src/services/registerBackgroundTasks';

export default function RootLayout() {
  useEffect(() => {
    // A confirmation link can start the app or arrive while it is running, and
    // either way the session appears through onAuthStateChange without anything
    // here having to route. What this does have to do is show a failure: a link
    // that quietly does nothing is indistinguishable from a broken app.
    return subscribeToAuthLinks((outcome) => {
      if (outcome.kind === 'failure') {
        Alert.alert('Confirmation failed', outcome.message);
      }
    });
  }, []);

  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
