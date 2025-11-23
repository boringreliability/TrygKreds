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
    </Stack>
  );
}
