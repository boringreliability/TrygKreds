import { useRouter } from 'expo-router';
import { CreateGroupScreen } from '../../src/screens/CreateGroupScreen';

export default function CreateGroup() {
  const router = useRouter();

  return (
    <CreateGroupScreen
      onSuccess={() => router.replace('/(app)/groups')}
      onCancel={() => router.back()}
    />
  );
}
