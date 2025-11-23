import { useRouter } from 'expo-router';
import { LoginScreen } from '../../src/screens/LoginScreen';

export default function Login() {
  const router = useRouter();

  const handleAuthSuccess = () => {
    router.replace('/(app)/groups');
  };

  return <LoginScreen onAuthSuccess={handleAuthSuccess} />;
}
