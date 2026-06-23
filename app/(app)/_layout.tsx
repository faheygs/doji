import React, { useEffect, useMemo } from 'react';
import { Tabs, usePathname } from 'expo-router';
import { StyleSheet, Platform, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAppRealtime } from '../../hooks/useAppRealtime';
import { useAuthGate } from '../../hooks/useAuthGate';
import { Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { CelebrationHost } from '../../components/gamification/CelebrationHost';
import { Text } from '../../components/ui/Text';
import { useDemoStore } from '../../stores/useDemoStore';
import {
  IconHome,
  IconTrophy,
  IconFriends,
  IconProfile,
  IconLightbulb,
} from '../../components/icons/Icons';

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
  const { session } = useAuthStore();
  const { ready } = useAuthGate();
  useAppRealtime(session?.user?.id);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const pathname = usePathname();
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  const exitDemoMode = useDemoStore((s) => s.exitDemoMode);
  const isHome = pathname === '/' || pathname === '/(app)' || pathname === '/(app)/index' || pathname === '/index';

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const t = window.setTimeout(() => {
      blurFocusedElementIfAriaHiddenAncestor();
    }, 0);
    return () => window.clearTimeout(t);
  }, [pathname]);

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

  if (!ready) return null;

  return (
    <View style={{ flex: 1 }}>
      <Tabs detachInactiveScreens={false} screenOptions={tabScreenOptions}>
      {/* Home feed — file `app/(app)/index.tsx` → href `/(app)` (see lib/routes.ts) */}
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
        name="friends"
        options={{
          title: 'Friends',
          tabBarAccessibilityLabel: 'Friends',
          tabBarIcon: ({ focused }) => (
            <IconFriends size={26} color={focused ? colors.text : colors.textTertiary} />
          ),
        }}
      />
      <Tabs.Screen
        name="suggest-challenge"
        options={{
          title: 'Suggest',
          tabBarAccessibilityLabel: 'Suggest a challenge',
          tabBarIcon: ({ focused }) => (
            <IconLightbulb size={26} color={focused ? colors.text : colors.textTertiary} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('profile', { screen: 'index' });
          },
        })}
        options={{
          tabBarAccessibilityLabel: 'Your profile',
          tabBarIcon: ({ focused }) => (
            <IconProfile size={26} color={focused ? colors.text : colors.textTertiary} />
          ),
        }}
      />
      <Tabs.Screen name="member" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="challenge" options={{ href: null }} />
      <Tabs.Screen name="camera" options={{ href: null }} />
      <Tabs.Screen name="poll" options={{ href: null }} />
      <Tabs.Screen name="task" options={{ href: null }} />
      <Tabs.Screen name="format" options={{ href: null }} />
      <Tabs.Screen name="post" options={{ href: null }} />
      <Tabs.Screen name="admin" options={{ href: null }} />
      </Tabs>
      <CelebrationHost />
      {isDemoMode && !isHome && (
        <TouchableOpacity
          onPress={exitDemoMode}
          activeOpacity={0.8}
          style={{
            position: 'absolute',
            bottom: tabBarHeight + Spacing.sm,
            alignSelf: 'center',
            left: 0,
            right: 0,
            alignItems: 'center',
            pointerEvents: 'box-none',
          }}
        >
          <View style={{
            backgroundColor: colors.primary,
            paddingVertical: 6,
            paddingHorizontal: Spacing.lg,
            borderRadius: 999,
          }}>
            <Text variant="label" color={colors.onPrimary} style={{ fontWeight: '700', letterSpacing: 0.4 }}>
              DEMO MODE — Tap to exit
            </Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}
