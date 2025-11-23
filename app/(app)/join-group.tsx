import { useRouter } from 'expo-router';
import { JoinGroupScreen } from '../../src/screens/JoinGroupScreen';

export default function JoinGroup() {
  const router = useRouter();

  return (
    <JoinGroupScreen
      onSuccess={() => router.replace('/(app)/groups')}
      onCancel={() => router.back()}
    />
  );
}
