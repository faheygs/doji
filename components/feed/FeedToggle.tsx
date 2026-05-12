import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Typography, Spacing, Radius } from '../../constants/theme';

export type FeedFilter = 'friends' | 'everyone';

type Props = {
  value: FeedFilter;
  onChange: (v: FeedFilter) => void;
};

export function FeedToggle({ value, onChange }: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceMuted, borderRadius: Radius.full }]}>
      {(['friends', 'everyone'] as FeedFilter[]).map((opt) => {
        const active = value === opt;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => onChange(opt)}
            style={[
              styles.segment,
              active && { backgroundColor: colors.surface, borderRadius: Radius.full },
            ]}
          >
            <Text
              style={[
                Typography.body,
                { color: active ? colors.text : colors.textTertiary },
              ]}
            >
              {opt === 'friends' ? 'Friends' : 'Everyone'}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
