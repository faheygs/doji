import React, { useEffect, useMemo } from 'react';
import { Appearance, Platform, View } from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
  type Theme as NavigationTheme,
} from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { useTheme } from '../../contexts/ThemeContext';

export function AppThemeHost({ children }: { children: React.ReactNode }) {
  const { colors, isDark } = useTheme();

  const navigationTheme = useMemo<NavigationTheme>(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: isDark,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.background,
        text: colors.text,
        border: colors.border,
        notification: colors.error,
      },
    };
  }, [colors, isDark]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    Appearance.setColorScheme(isDark ? 'dark' : 'light');
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background, isDark]);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>{children}</View>
    </NavigationThemeProvider>
  );
}
