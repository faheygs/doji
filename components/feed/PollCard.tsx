import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Typography, Spacing, Radius } from '../../constants/theme';

type Props = {
  optionText: string;
  username: string;
};

export function PollCard({ optionText, username }: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.accentLight, borderColor: colors.accent }]}>
      <Text style={[Typography.caption, { color: colors.accent }]}>
        @{username} voted
      </Text>
      <Text style={[Typography.subhead, { color: colors.text, marginTop: 2 }]}>
        "{optionText}"
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
});
