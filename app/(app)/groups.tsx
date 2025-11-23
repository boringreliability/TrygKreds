import { useRouter } from 'expo-router';
import { GroupsScreen } from '../../src/screens/GroupsScreen';

export default function Groups() {
  const router = useRouter();

  return (
    <GroupsScreen
      onCreateGroup={() => router.push('/(app)/create-group')}
      onJoinGroup={() => router.push('/(app)/join-group')}
      onSelectGroup={(group) => router.push(`/(app)/group/${group.id}`)}
    />
  );
}
