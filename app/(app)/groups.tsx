import { useRouter } from 'expo-router';
import { GroupsScreen } from '../../src/screens/GroupsScreen';

export default function Groups() {
  const router = useRouter();

  return (
    <GroupsScreen
      onCreateGroup={() => router.push('/(app)/create-group')}
      onJoinGroup={() => router.push('/(app)/join-group')}
      onEditProfile={() => router.push('/(app)/profile')}
      onOpenPrivacy={() => router.push('/(app)/privacy')}
      onSelectGroup={(group) =>
        router.push({
          pathname: '/(app)/group/[id]',
          params: { id: group.id, name: group.name },
        })
      }
    />
  );
}
