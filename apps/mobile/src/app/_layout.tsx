import '../global.css';

import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '../auth/AuthContext';

function NavigationGate() {
  const { accessToken, hasConsent, isLoading } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = useRouter() as any;
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;

    const firstSegment = segments[0] as string | undefined;
    const inAuthGroup = firstSegment === 'login' || firstSegment === 'consent';

    if (!accessToken && !inAuthGroup) {
      router.replace('/login');
    } else if (accessToken && !hasConsent && firstSegment !== 'consent') {
      router.replace('/consent');
    } else if (accessToken && hasConsent && inAuthGroup) {
      router.replace('/');
    }
  }, [accessToken, hasConsent, isLoading, segments, router]);

  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <NavigationGate />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
