import '../global.css';

import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';
import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
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

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <NavigationGate />
        <AnimatedSplashOverlay />
        <AppTabs />
      </AuthProvider>
    </ThemeProvider>
  );
}
