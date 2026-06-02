import React, { useEffect, useMemo, useRef } from 'react';
import { Stack, type Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, StyleSheet, View } from 'react-native';
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
import { AppIconBadgeSync } from '../components/notifications/AppIconBadgeSync';
import { notificationHrefFromData } from '../lib/notificationHref';
import { safeReplace } from '../lib/routes';
import { isAuthRoutingPending } from '../lib/authRoute';
import { useAuthGate } from '../hooks/useAuthGate';

function BrandedFontsGate({ children }: { children: React.ReactNode }) {
  const [fontsLoaded, fontError] = useFonts({
    DojiWordmark: Sora_800ExtraBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  const isLoading = useAuthStore((s) => s.isLoading);
  const isProfileLoading = useAuthStore((s) => s.isProfileLoading);
  const splashReady = useRef(false);
  const splashHidden = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    SplashScreen.preventAutoHideAsync()
      .then(() => {
        splashReady.current = true;
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!splashReady.current) return;
    if (!fontsLoaded && !fontError) return;
    if (isAuthRoutingPending(isLoading, isProfileLoading)) return;
    if (splashHidden.current) return;
    splashHidden.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError, isLoading, isProfileLoading]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return <>{children}</>;
}

function RootLayoutInner() {
  const { setSession, setLoading, fetchProfile } = useAuthStore();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const gate = useAuthGate();

  const toastConfig = useMemo(() => buildToastConfig(colors, isDark), [colors, isDark]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(session);
      if (session?.user?.id) {
        await fetchProfile(session.user.id);
        // Ghost session: signed in but no profile row (abandoned partial signup).
        // Sign out silently so the user lands on the welcome screen.
        if (!cancelled && !useAuthStore.getState().profile) {
          // scope: 'local' clears the stored session without a server round-trip,
          // avoiding AuthApiError when the refresh token is already expired/revoked.
          await supabase.auth.signOut({ scope: 'local' });
          // onAuthStateChange fires with null and clears session state.
        }
      } else {
        useAuthStore.getState().setProfile(null);
      }
      if (!cancelled) setLoading(false);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.id) {
        void fetchProfile(session.user.id);
      } else {
        useAuthStore.getState().setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [fetchProfile, setLoading, setSession]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    import('expo-notifications').then((Notifications) => {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          // OS icon badge is driven by AppIconBadgeSync + in-app bell unread count, not push payload.
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    });
  }, []);

  // Auto-register push token when user is authenticated
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;

  useEffect(() => {
    if (Platform.OS === 'web') return;
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
  }, [userId]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!gate.ready) return;

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
            safeReplace(router, href);
            await Notifications.clearLastNotificationResponseAsync();
          }
        } catch {
          /* ignore */
        }
      })();

      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const href = notificationHrefFromData(response.notification.request.content.data);
        if (href) safeReplace(router, href);
      });
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [router, gate.ready]);

  if (!gate.ready) {
    return null;
  }

  return (
    <GestureHandlerRootView
      style={[styles.flex, { backgroundColor: colors.background }, webRootViewStyle]}
    >
      <SafeAreaProvider style={styles.flex}>
        <View style={styles.flex}>
          <AppIconBadgeSync />
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
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Protected guard={gate.canUseApp}>
              <Stack.Screen name="(app)" />
            </Stack.Protected>
            <Stack.Protected guard={gate.mustFinishOnboarding}>
              <Stack.Screen name="(onboarding)" />
            </Stack.Protected>
            <Stack.Protected guard={gate.canUseAuthGroup}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
          </Stack>
          <Toast config={toastConfig} />
        </View>
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
