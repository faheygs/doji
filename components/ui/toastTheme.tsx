import React from 'react';
import { View, Text as RNText, StyleSheet, Platform } from 'react-native';
import type { ToastConfigParams } from 'react-native-toast-message';
import type { AppColors } from '../../constants/theme';

function shellShadow(isDark: boolean) {
  if (Platform.OS === 'web') {
    const alpha = isDark ? 0.35 : 0.15;
    return { boxShadow: `0px 4px 12px rgba(0,0,0,${alpha})` };
  }
  return {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.35 : 0.15,
    shadowRadius: 12,
    elevation: 8,
  };
}

export function buildToastConfig(colors: AppColors, isDark: boolean): Record<
  string,
  (props: ToastConfigParams<any>) => React.ReactElement
> {
  const Shell = ({
    borderLeftColor,
    text1,
    text2,
  }: {
    borderLeftColor: string;
    text1?: string;
    text2?: string;
  }) => (
    <View
      style={[
        styles.shell,
        {
          backgroundColor: colors.surfaceElevated,
          borderLeftColor,
          borderColor: colors.hairline,
        },
        shellShadow(isDark),
      ]}
    >
      {!!text1 && (
        <RNText style={[styles.t1, { color: colors.text }]} numberOfLines={3}>
          {text1}
        </RNText>
      )}
      {!!text2 && (
        <RNText style={[styles.t2, { color: colors.textSecondary }]} numberOfLines={4}>
          {text2}
        </RNText>
      )}
    </View>
  );

  return {
    success: ({ text1, text2 }) => (
      <Shell borderLeftColor={colors.success} text1={text1} text2={text2} />
    ),
    error: ({ text1, text2 }) => <Shell borderLeftColor={colors.error} text1={text1} text2={text2} />,
    info: ({ text1, text2 }) => <Shell borderLeftColor={colors.link} text1={text1} text2={text2} />,
  };
}

const styles = StyleSheet.create({
  shell: {
    marginHorizontal: 16,
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 4,
    justifyContent: 'center',
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
  },
  t1: {
    fontSize: 14,
    fontWeight: '600',
  },
  t2: {
    fontSize: 13,
    marginTop: 4,
    fontWeight: '400',
  },
});
