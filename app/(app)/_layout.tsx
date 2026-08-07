import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="groups"
        options={{
          title: 'My Groups',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="create-group"
        options={{
          title: 'Create Group',
          headerShown: false,
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="join-group"
        options={{
          title: 'Join Group',
          headerShown: false,
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="profile"
        options={{
          title: 'Display Name',
          headerShown: false,
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="group/[id]"
        options={{
          title: 'Group',
          headerShown: true,
        }}
      />
    </Stack>
  );
}
