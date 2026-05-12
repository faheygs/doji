import React, { useEffect, useMemo } from 'react';
import { Stack, type Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, StyleSheet } from 'react-native';
import { webRootViewStyle, webScrollParentStyle } from '../constants/theme';
import { useFonts } from 'expo-font';
import { Sora_800ExtraBold } from '@expo-google-fonts/sora';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

SplashScreen.preventAutoHideAsync().catch(() => {
  /* debugger / web */
});

/** Web: native screens attach aria-hidden / pointer-events in ways that break scrolling + focus. */
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  try {
    require('react-native-screens').enableScreens(false);
  } catch {
    /* ignore */
  }
}
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { useAuthStore } from '../stores/useAuthStore';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { buildToastConfig } from '../components/ui/toastTheme';

/** Push payloads may include `url` from the scheduler, or legacy `type: CHALLENGE`. */
function notificationHrefFromData(data: unknown): Href | null {
  if (!data || typeof data !== 'object') return null;
  const rec = data as Record<string, unknown>;
  const url = rec.url;
  if (typeof url === 'string' && url.startsWith('/')) return url as Href;
  if (rec.type === 'CHALLENGE') return '/(app)/challenge';
  return null;
}

function BrandedFontsGate({ children }: { children: React.ReactNode }) {
  const [fontsLoaded, fontError] = useFonts({
    DojiWordmark: Sora_800ExtraBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return <>{children}</>;
}

function RootLayoutInner() {
  const { setSession, setLoading, fetchProfile } = useAuthStore();
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const toastConfig = useMemo(() => buildToastConfig(colors, isDark), [colors, isDark]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user.id) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user.id) {
        fetchProfile(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile, setLoading, setSession]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    import('expo-notifications').then((Notifications) => {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    });
  }, []);

  // Auto-register push token when user is authenticated
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const userId = useAuthStore.getState().session?.user?.id;
    if (!userId) return;

    let cancelled = false;
    void (async () => {
      try {
        const Notifications = await import('expo-notifications');
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') return;
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const { data: token } = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        if (cancelled || !token) return;
        const current = useAuthStore.getState().profile?.notification_token;
        if (current !== token) {
          await supabase.from('profiles').update({ notification_token: token }).eq('id', userId);
        }
      } catch { /* token refresh is best-effort */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let cancelled = false;
    let subscription: { remove: () => void } | undefined;

    import('expo-notifications').then((Notifications) => {
      if (cancelled) return;

      void (async () => {
        try {
          const last = await Notifications.getLastNotificationResponseAsync();
          if (cancelled) return;
          const href = notificationHrefFromData(last?.notification.request.content.data);
          if (href) {
            router.push(href);
            await Notifications.clearLastNotificationResponseAsync();
          }
        } catch {
          /* ignore */
        }
      })();

      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const href = notificationHrefFromData(response.notification.request.content.data);
        if (href) router.push(href);
      });
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [router]);

  return (
    <GestureHandlerRootView
      style={[styles.flex, { backgroundColor: colors.background }, webRootViewStyle]}
    >
      <SafeAreaProvider style={styles.flex}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: [
              { backgroundColor: colors.background, flex: 1 },
              webScrollParentStyle,
            ],
          }}
        >
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
        </Stack>
        <Toast config={toastConfig} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrandedFontsGate>
          <RootLayoutInner />
        </BrandedFontsGate>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
