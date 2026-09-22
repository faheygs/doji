import React, { useEffect, useMemo } from 'react';
import { Tabs, usePathname } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts/ThemeContext';
import { getBottomTabBarMetrics } from '../../../lib/safeAreaLayout';
import {
  IconFriends,
  IconHome,
  IconLightbulb,
  IconProfile,
  IconTrophy,
} from '../../../components/icons/Icons';

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

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const pathname = usePathname();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const timer = window.setTimeout(blurFocusedElementIfAriaHiddenAncestor, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const tabBarMetrics = useMemo(
    () => getBottomTabBarMetrics(Platform.OS, insets.bottom),
    [insets.bottom],
  );
  const tabBarStyle = useMemo(
    () => [
      {
        backgroundColor: colors.background,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.hairline,
        elevation: 0 as const,
      },
      tabBarMetrics,
    ],
    [colors.background, colors.hairline, tabBarMetrics],
  );
  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      freezeOnBlur: true,
      tabBarStyle,
      tabBarShowLabel: false,
      tabBarActiveTintColor: colors.text,
      tabBarInactiveTintColor: colors.textTertiary,
      ...(Platform.OS === 'web' ? { sceneContainerStyle: { flex: 1, minHeight: 0 } } : {}),
    }),
    [colors.text, colors.textTertiary, tabBarStyle],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tabs detachInactiveScreens screenOptions={screenOptions}>
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
            tabPress: (event) => {
              event.preventDefault();
              navigation.navigate('profile');
            },
          })}
          options={{
            tabBarAccessibilityLabel: 'Your profile',
            tabBarIcon: ({ focused }) => (
              <IconProfile size={26} color={focused ? colors.text : colors.textTertiary} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}
