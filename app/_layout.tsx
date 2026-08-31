import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !__DEV__ && !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  // Enough performance telemetry to spot regressions without adding material
  // client overhead or exhausting observability quotas during a traffic spike.
  tracesSampleRate: 0.02,
  environment: process.env.EXPO_PUBLIC_APP_ENV,
});

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import * as SplashScreen from 'expo-splash-screen';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { Spacing, webRootViewStyle, webScrollParentStyle } from '../constants/theme';
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
import { useAuthGate } from '../hooks/useAuthGate';
import { AppKeyboardToolbar } from '../components/ui/AppKeyboardToolbar';
import { AppProviders } from '../components/AppProviders';
import { AppThemeHost } from '../components/system/AppThemeHost';
import { ErrorState } from '../components/ui/ErrorState';
import { useNativeNotifications } from '../hooks/useNativeNotifications';
import { Text } from '../components/ui/Text';
import { initialSessionBootstrap, observeSessionBootstrap } from '../lib/initialSessionBootstrap';

const FONT_BOOTSTRAP_DEADLINE_MS = 2_500;
const SESSION_BOOTSTRAP_DEADLINE_MS = 8_000;

function BrandedFontsGate({ children }: { children: React.ReactNode }) {
  const [fontsLoaded, fontError] = useFonts({
    DojiWordmark: Sora_800ExtraBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const [fontDeadlineReached, setFontDeadlineReached] = useState(false);
  const splashHidden = useRef(false);
  const fontsSettled = fontsLoaded || !!fontError || fontDeadlineReached;

  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const timeout = setTimeout(() => setFontDeadlineReached(true), FONT_BOOTSTRAP_DEADLINE_MS);
    return () => clearTimeout(timeout);
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!fontsSettled) return;
    if (splashHidden.current) return;
    splashHidden.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, [fontsSettled]);

  if (!fontsSettled) {
    return null;
  }

  return <>{children}</>;
}

function RootLayoutInner() {
  const { setSession, setLoading, fetchProfile } = useAuthStore();
  const { colors, isDark } = useTheme();
  const gate = useAuthGate();
  const [sessionBootstrapError, setSessionBootstrapError] = useState(false);
  const retrySessionBootstrap = useRef<() => void>(() => {});
  useNativeNotifications(gate.canUseApp);

  const toastConfig = useMemo(() => buildToastConfig(colors, isDark), [colors, isDark]);

  useEffect(() => {
    let cancelled = false;
    let cancelBootstrapObservation = () => {};

    const applySession = (session: Awaited<ReturnType<typeof initialSessionBootstrap.get>>) => {
      if (cancelled) return;
      setSessionBootstrapError(false);
      setSession(session);
      if (session?.user?.id) {
        void fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    };

    const startSessionBootstrap = () => {
      cancelBootstrapObservation();
      setSessionBootstrapError(false);
      setLoading(true);
      cancelBootstrapObservation = observeSessionBootstrap(
        initialSessionBootstrap.get(),
        SESSION_BOOTSTRAP_DEADLINE_MS,
        {
          onSession: applySession,
          onError: (error) => {
            if (cancelled) return;
            setLoading(false);
            setSessionBootstrapError(true);
            Sentry.captureException(error, {
              tags: { area: 'startup', operation: 'session_restore' },
            });
          },
          onTimeout: () => {
            if (cancelled) return;
            // Keep observing the original request. If the auth lock releases,
            // onSession recovers automatically without making the user sign in.
            setLoading(false);
            setSessionBootstrapError(true);
            Sentry.captureMessage('Initial session restoration timed out', {
              level: 'warning',
              tags: { area: 'startup', operation: 'session_restore' },
            });
          },
        },
      );
    };

    retrySessionBootstrap.current = startSessionBootstrap;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // An auth event is newer than the startup snapshot. Stop the old observer
      // so a delayed getSession result cannot overwrite a sign-in or sign-out.
      cancelBootstrapObservation();
      applySession(session);
    });

    startSessionBootstrap();

    return () => {
      cancelled = true;
      cancelBootstrapObservation();
      subscription.unsubscribe();
    };
  }, [fetchProfile, setLoading, setSession]);

  if (sessionBootstrapError) {
    return (
      <StartupFrame backgroundColor={colors.background}>
        <ErrorState
          title="Couldn't finish loading Doji"
          message="Your account is safe. Try again to restore your session."
          onRetry={() => retrySessionBootstrap.current()}
        />
      </StartupFrame>
    );
  }

  if (gate.profileLoadFailed) {
    return (
      <StartupFrame backgroundColor={colors.background}>
        <ErrorState
          title="Couldn't load your account"
          message="Your account is still safe. Check your connection and try again."
          onRetry={() => {
            const userId = useAuthStore.getState().session?.user?.id;
            if (userId) void useAuthStore.getState().fetchProfile(userId);
          }}
        />
      </StartupFrame>
    );
  }

  if (!gate.ready) {
    return (
      <StartupFrame backgroundColor={colors.background}>
        <View style={styles.startupLoading} accessibilityLiveRegion="polite">
          <Text variant="display" color={colors.text}>
            Doji
          </Text>
          <ActivityIndicator color={colors.primary} accessibilityLabel="Loading Doji" />
        </View>
      </StartupFrame>
    );
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

function StartupFrame({
  backgroundColor,
  children,
}: {
  backgroundColor: string;
  children: React.ReactNode;
}) {
  return (
    <AppThemeHost>
      <GestureHandlerRootView style={[styles.flex, { backgroundColor }, webRootViewStyle]}>
        <SafeAreaProvider style={[styles.flex, { backgroundColor }]}>{children}</SafeAreaProvider>
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
  startupLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
});
