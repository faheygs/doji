import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import type { FeedAudience } from '../../lib/feedAudience';
import { IconChevronRight, IconFriends, IconGlobe } from '../icons/Icons';
import { Text } from '../ui/Text';

export function FeedAudienceMenu({
  audience,
  onSelect,
}: {
  audience: FeedAudience;
  onSelect: (audience: FeedAudience) => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const AudienceIcon = audience === 'everyone' ? IconGlobe : IconFriends;
  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        onPress={() => setOpen((value) => !value)}
        style={styles.button}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${audience === 'everyone' ? 'Everyone' : 'Friends'} feed`}
      >
        <AudienceIcon size={20} color={colors.text} />
        <Text variant="headingMedium" style={styles.buttonLabel}>
          {audience === 'everyone' ? 'Everyone' : 'Friends'}
        </Text>
        <View style={open ? styles.chevronOpen : undefined}>
          <IconChevronRight size={18} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>
      {open ? (
        <View style={[styles.menu, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          {(['everyone', 'friends'] as const).map((key) => {
            const active = audience === key;
            const Icon = key === 'everyone' ? IconGlobe : IconFriends;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => {
                  Haptics.selectionAsync();
                  onSelect(key);
                  setOpen(false);
                }}
                style={[styles.item, active && { backgroundColor: colors.chipBackground }]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Icon size={20} color={active ? colors.accent : colors.textSecondary} />
                <Text variant="label" color={active ? colors.accent : colors.text} style={styles.label}>
                  {key === 'friends' ? 'Friends' : 'Everyone'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', alignItems: 'flex-start', marginHorizontal: Spacing.md, marginBottom: Spacing.xs },
  button: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, minHeight: 42, paddingHorizontal: Spacing.sm, borderRadius: Radius.md },
  buttonLabel: { fontWeight: '700' },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  menu: { position: 'absolute', top: 44, left: 0, zIndex: 20, minWidth: 190, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.xs, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  item: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: Radius.md },
  label: { fontWeight: '600' },
});
