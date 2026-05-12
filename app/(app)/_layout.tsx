import React, { useEffect, useMemo } from 'react';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAppRealtime } from '../../hooks/useAppRealtime';
import { Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { IconHome, IconTrophy, IconProfile } from '../../components/icons/Icons';

function blurFocusedElementIfAriaHiddenAncestor(): void {
  if (typeof document === 'undefined') return;
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return;
  let node: HTMLElement | null = el;
  while (node) {
    if (node.getAttribute('aria-hidden') === 'true') {
      el.blur();
      return;
    }
    node = node.parentElement;
  }
}

export default function AppLayout() {
  const { session, profile, isLoading } = useAuthStore();
  useAppRealtime(session?.user?.id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const pathname = usePathname();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const t = window.setTimeout(() => {
      blurFocusedElementIfAriaHiddenAncestor();
    }, 0);
    return () => window.clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    if (isLoading) return;
    if (!session || !profile) {
      router.replace('/(auth)/welcome');
    }
  }, [session, profile, isLoading, router]);

  const tabBarHeight = 52 + (Platform.OS === 'ios' ? Math.max(insets.bottom, 8) : insets.bottom + 8);

  const tabBarStyle = useMemo(
    () => [
      {
        backgroundColor: colors.background,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.hairline,
        elevation: 0 as const,
      },
      {
        height: tabBarHeight,
        paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 10) : Spacing.sm,
        paddingTop: 8,
      },
    ],
    [colors.background, colors.hairline, tabBarHeight, insets.bottom],
  );

  const tabScreenOptions = useMemo(
    () => ({
      headerShown: false,
      freezeOnBlur: false,
      tabBarStyle,
      tabBarShowLabel: false,
      tabBarActiveTintColor: colors.text,
      tabBarInactiveTintColor: colors.textTertiary,
      ...(Platform.OS === 'web' ? { sceneContainerStyle: { flex: 1, minHeight: 0 } } : {}),
    }),
    [colors.text, colors.textTertiary, tabBarStyle],
  );

  return (
    <Tabs detachInactiveScreens={false} screenOptions={tabScreenOptions}>
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <IconHome size={26} color={focused ? colors.text : colors.textTertiary} />
          ),
        }}
      />
      <Tabs.Screen
        name="rank"
        options={{
          tabBarIcon: ({ focused }) => (
            <IconTrophy size={26} color={focused ? colors.text : colors.textTertiary} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarAccessibilityLabel: 'Your profile',
          tabBarIcon: ({ focused }) => (
            <IconProfile size={26} color={focused ? colors.text : colors.textTertiary} />
          ),
        }}
      />
      {/* Hidden screens (no tab bar icon) */}
      <Tabs.Screen name="friends" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="challenge" options={{ href: null }} />
      <Tabs.Screen name="camera" options={{ href: null }} />
      <Tabs.Screen name="post" options={{ href: null }} />
    </Tabs>
  );
}
