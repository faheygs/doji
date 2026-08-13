import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !__DEV__,
  tracesSampleRate: 0.2,
  environment: process.env.EXPO_PUBLIC_APP_ENV,
});

import React, { useEffect, useMemo, useRef } from 'react';
import { Stack, type Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, StyleSheet, View, AppState } from 'react-native';
import { webRootViewStyle, webScrollParentStyle } from '../constants/theme';
import { useFonts } from 'expo-font';
import { Sora_800ExtraBold } from '@expo-google-fonts/sora/800ExtraBold';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';

if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync().catch(() => {});
}

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
import { useAuthStore } from '../stores/useAuthStore';
import { useTheme } from '../contexts/ThemeContext';
import { buildToastConfig } from '../components/ui/toastTheme';
import { AppIconBadgeSync } from '../components/notifications/AppIconBadgeSync';
import { notificationHrefFromData } from '../lib/notificationHref';
import { safeReplace } from '../lib/routes';
import { isAuthRoutingPending } from '../lib/authRoute';
import { useAuthGate } from '../hooks/useAuthGate';
import { AppKeyboardToolbar } from '../components/ui/AppKeyboardToolbar';
import { AppProviders } from '../components/AppProviders';
import { mergeNotificationPreferences } from '../lib/notificationPreferences';

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
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const splashHidden = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!fontsLoaded && !fontError) return;
    if (isAuthRoutingPending(isLoading, isProfileLoading, session, profile)) return;
    if (splashHidden.current) return;
    splashHidden.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError, isLoading, isProfileLoading, session, profile]);

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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(session);
      if (session?.user?.id) {
        await fetchProfile(session.user.id);
      } else {
        // No session — nothing to fetch; mark startup done immediately.
        if (!cancelled) setLoading(false);
      }
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
          // Foreground: receive silently — the in-app bell is the source of truth.
          // Background/killed-app pushes are unaffected by this handler and always show the OS banner.
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: false,
          shouldShowList: false,
        }),
      });
    });
  }, []);

  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const userId = session?.user?.id;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!userId || !profile || profile.id !== userId) return;

    async function syncPushToken() {
      try {
        const activeProfile = useAuthStore.getState().profile;
        const notificationsEnabled = mergeNotificationPreferences(
          activeProfile?.notification_preferences,
        ).push_enabled;
        if (!notificationsEnabled) {
          if (!activeProfile?.notification_token) return;
          const { error } = await supabase.rpc('unregister_push_token');
          if (error) throw error;
          const current = useAuthStore.getState().profile;
          if (current) useAuthStore.getState().setProfile({ ...current, notification_token: null });
          return;
        }
        const Notifications = await import('expo-notifications');
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') return;
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const { data: token } = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        if (!token) return;
        const current = useAuthStore.getState().profile?.notification_token;
        if (current !== token) {
          const { error } = await supabase.rpc('register_push_token', { p_token: token });
          if (error) throw error;
          const profile = useAuthStore.getState().profile;
          if (profile) {
            useAuthStore.getState().setProfile({ ...profile, notification_token: token });
          }
        }
      } catch (e) {
        if (__DEV__) console.warn('[pushToken] sync failed', e);
      }
    }

    void syncPushToken();

    // Re-sync whenever the app comes back to the foreground — iOS silently rotates
    // APNs tokens while the app is backgrounded, so we can't rely on cold-start only.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncPushToken();
    });

    return () => sub.remove();
  }, [profile?.id, userId]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!gate.ready) return;

    let cancelled = false;
    let subscription: { remove: () => void } | undefined;
    let receivedSub: { remove: () => void } | undefined;

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

      receivedSub = Notifications.addNotificationReceivedListener((notification) => {
        const { title, body, data } = notification.request.content;
        if (!title && !body) return;
        Toast.show({
          type: 'info',
          text1: title ?? undefined,
          text2: body ?? undefined,
          onPress: () => {
            const href = notificationHrefFromData(data);
            if (href) safeReplace(router, href);
            Toast.hide();
          },
        });
      });
    });

    return () => {
      cancelled = true;
      subscription?.remove();
      receivedSub?.remove();
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
              contentStyle: [{ backgroundColor: colors.background, flex: 1 }, webScrollParentStyle],
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
          <AppKeyboardToolbar />
          <Toast config={toastConfig} />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootLayout() {
  return (
    <AppProviders>
      <BrandedFontsGate><RootLayoutInner /></BrandedFontsGate>
    </AppProviders>
  );
}

export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
