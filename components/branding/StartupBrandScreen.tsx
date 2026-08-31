import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { webRootViewStyle } from '../../constants/theme';

export const STARTUP_BACKGROUND_COLOR = '#FFFFFF';
export const STARTUP_LOGO_SIZE = 100;

/**
 * Pixel-matched handoff target for the native Expo launch screen.
 *
 * The native layer and this React layer intentionally use the same bundled
 * image, size, placement, and background so session restoration does not look
 * like a second loading screen.
 */
export function StartupBrandScreen() {
  return (
    <View
      testID="startup-brand-screen"
      style={[styles.flex, webRootViewStyle]}
    >
      <StatusBar style="dark" />
      <View style={styles.centered}>
        <Image
          accessibilityLabel="Doji"
          accessibilityRole="image"
          source={require('../../assets/icon.png')}
          resizeMode="contain"
          style={styles.logo}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: STARTUP_BACKGROUND_COLOR,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: STARTUP_BACKGROUND_COLOR,
  },
  logo: {
    width: STARTUP_LOGO_SIZE,
    height: STARTUP_LOGO_SIZE,
  },
});
