import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import type { FeedAudience } from '../../lib/feedAudience';
import { IconChevronDown, IconFriends, IconGlobe } from '../icons/Icons';
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
        activeOpacity={0.82}
        style={[
          styles.button,
          {
            backgroundColor: colors.primaryLight,
            borderColor: `${colors.primary}66`,
          },
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${audience === 'everyone' ? 'Everyone' : 'Friends'} feed`}
        accessibilityHint="Opens the feed selection menu"
      >
        <AudienceIcon size={19} color={colors.primary} />
        <Text variant="headingMedium" color={colors.primary} style={styles.buttonLabel}>
          {audience === 'everyone' ? 'Everyone' : 'Friends'}
        </Text>
        <View style={[styles.chevron, open && styles.chevronOpen]}>
          <IconChevronDown size={18} color={colors.primary} />
        </View>
      </TouchableOpacity>
      {open ? (
        <View
          style={[
            styles.menu,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: `${colors.primary}3D`,
              shadowColor: colors.shadowBase,
            },
          ]}
        >
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
                activeOpacity={0.78}
                style={[styles.item, active && { backgroundColor: colors.primaryLight }]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${key === 'friends' ? 'Friends' : 'Everyone'} feed`}
              >
                <Icon size={20} color={active ? colors.primary : colors.textSecondary} />
                <Text
                  variant="headingMedium"
                  color={active ? colors.primary : colors.text}
                  style={styles.label}
                >
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
  wrap: {
    position: 'relative',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  button: {
    width: 190,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  buttonLabel: { fontWeight: '800' },
  chevron: { transform: [{ rotate: '0deg' }] },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  menu: {
    position: 'absolute',
    top: 50,
    left: '50%',
    zIndex: 20,
    width: 190,
    marginLeft: -95,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.xs,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  item: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: Radius.md },
  label: { flex: 1, fontWeight: '700' },
});
