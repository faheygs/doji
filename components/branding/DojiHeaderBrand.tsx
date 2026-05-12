import React from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import { BrandWordmark } from '../../constants/theme';
import { Image } from 'expo-image';
import { useTheme } from '../../contexts/ThemeContext';

/** Feed header lockup: transparent mark (`mark.png`) + wordmark. `icon.png` stays for launcher/splash (may include matte). */
export function DojiHeaderBrand() {
  const { colors } = useTheme();
  const logoSource = require('../../assets/mark.png');

  return (
    <View
      style={styles.row}
      accessibilityRole="header"
      accessibilityLabel="Doji"
    >
      <Image source={logoSource} style={styles.logo} contentFit="contain" />
      <Text
        style={[
          BrandWordmark.header,
          { color: colors.text },
          Platform.OS === 'android' && { includeFontPadding: false },
        ]}
      >
        Doji
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 34,
    height: 34,
  },
});
