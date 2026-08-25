import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !__DEV__ && !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  // Enough performance telemetry to spot regressions without adding material
  // client overhead or exhausting observability quotas during a traffic spike.
  tracesSampleRate: 0.02,
  environment: process.env.EXPO_PUBLIC_APP_ENV,
});

import React, { useEffect, useMemo, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, StyleSheet, View } from 'react-native';
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
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { useTheme } from '../contexts/ThemeContext';
import { buildToastConfig } from '../components/ui/toastTheme';
import { AppIconBadgeSync } from '../components/notifications/AppIconBadgeSync';
import { isAuthRoutingPending } from '../lib/authRoute';
import { useAuthGate } from '../hooks/useAuthGate';
import { AppKeyboardToolbar } from '../components/ui/AppKeyboardToolbar';
import { AppProviders } from '../components/AppProviders';
import { AppThemeHost } from '../components/system/AppThemeHost';
import { ErrorState } from '../components/ui/ErrorState';
import { useNativeNotifications } from '../hooks/useNativeNotifications';

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
  const profileLoadState = useAuthStore((s) => s.profileLoadState);
  const splashHidden = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!fontsLoaded && !fontError) return;
    if (
      isAuthRoutingPending(
        isLoading,
        isProfileLoading,
        session,
        profile,
        profileLoadState,
      )
    ) return;
    if (splashHidden.current) return;
    splashHidden.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, [
    fontsLoaded,
    fontError,
    isLoading,
    isProfileLoading,
    session,
    profile,
    profileLoadState,
  ]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return <>{children}</>;
}

function RootLayoutInner() {
  const { setSession, setLoading, fetchProfile } = useAuthStore();
  const { colors, isDark } = useTheme();
  const gate = useAuthGate();
  useNativeNotifications(gate.canUseApp);

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

  if (gate.profileLoadFailed) {
    return (
      <AppThemeHost>
        <GestureHandlerRootView
          style={[styles.flex, { backgroundColor: colors.background }, webRootViewStyle]}
        >
          <SafeAreaProvider style={[styles.flex, { backgroundColor: colors.background }]}>
            <ErrorState
              title="Couldn't load your account"
              message="Your account is still safe. Check your connection and try again."
              onRetry={() => {
                const userId = useAuthStore.getState().session?.user?.id;
                if (userId) void useAuthStore.getState().fetchProfile(userId);
              }}
            />
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </AppThemeHost>
    );
  }

  if (!gate.ready) {
    return null;
  }

  return (
    <AppThemeHost>
      <GestureHandlerRootView
        style={[styles.flex, { backgroundColor: colors.background }, webRootViewStyle]}
      >
        <SafeAreaProvider style={[styles.flex, { backgroundColor: colors.background }]}>
          <View style={[styles.flex, { backgroundColor: colors.background }]}>
            {gate.canUseApp ? <AppIconBadgeSync /> : null}
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
              <Stack.Protected guard={gate.canUseBannedScreen}>
                <Stack.Screen name="banned" />
              </Stack.Protected>
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
    </AppThemeHost>
  );
}

function RootLayout() {
  return (
    <AppProviders>
      <BrandedFontsGate>
        <RootLayoutInner />
      </BrandedFontsGate>
    </AppProviders>
  );
}

export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
