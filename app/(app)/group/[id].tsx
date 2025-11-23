import { useLocalSearchParams, useRouter } from 'expo-router';
import { GroupMapScreen } from '../../../src/screens';

export default function GroupDetail() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();

  return (
    <GroupMapScreen
      groupId={id}
      groupName={name || 'Group'}
      onBack={() => router.back()}
    />
  );
}
