import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { IconChevronRight } from '../icons/Icons';
import { Text } from '../ui/Text';

export function SettingsGroup({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.group, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

type RowProps = {
  label: string;
  onPress?: () => void;
  danger?: boolean;
  right?: React.ReactNode;
  subtitle?: string;
  icon?: React.ReactNode;
  showChevron?: boolean;
  isLast?: boolean;
};

export function SettingsRow({
  label, onPress, danger, right, subtitle, icon, showChevron = true, isLast,
}: RowProps) {
  const { colors } = useTheme();
  const content = (
    <View style={[styles.row, !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      {icon ? <View style={[styles.icon, { backgroundColor: colors.chipBackground }]}>{icon}</View> : null}
      <View style={styles.copy}>
        <Text variant="body" color={danger ? colors.error : colors.text} style={styles.label}>{label}</Text>
        {subtitle ? <Text variant="micro" color={colors.textTertiary}>{subtitle}</Text> : null}
      </View>
      {right ?? (showChevron ? <IconChevronRight size={18} color={colors.textTertiary} /> : null)}
    </View>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.78} accessibilityRole="button">{content}</TouchableOpacity>
  ) : content;
}

const styles = StyleSheet.create({
  group: { marginHorizontal: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm, minHeight: 64 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 2 },
  label: { fontWeight: '600' },
});
