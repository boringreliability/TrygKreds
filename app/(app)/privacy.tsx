import { useRouter } from 'expo-router';
import { PrivacyScreen } from '../../src/screens/PrivacyScreen';

export default function Privacy() {
  const router = useRouter();

  return <PrivacyScreen onBack={() => router.back()} />;
}
