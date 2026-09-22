import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Radius, Spacing, webScrollParentStyle } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import type { RecentProfileSearch } from '../../lib/recentProfileSearches';
import { IconClose } from '../icons/Icons';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { Text } from '../ui/Text';

type Props = {
  recents: readonly RecentProfileSearch[];
  onSelect: (profile: RecentProfileSearch) => void;
  onRemove: (profileId: string) => void;
  onClear: () => void;
};

export function RecentProfileSearchList({ recents, onSelect, onRemove, onClear }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        content: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: Spacing.md,
        },
        row: {
          minHeight: 68,
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
        },
        identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
        names: { flex: 1, minWidth: 0, gap: 2 },
        remove: {
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: Radius.full,
        },
        empty: { alignItems: 'center', paddingTop: Spacing.xxl, gap: Spacing.xs },
      }),
    [colors.hairline],
  );

  return (
    <FlatList
      style={webScrollParentStyle}
      data={recents}
      removeClippedSubviews={false}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        recents.length ? (
          <View style={styles.header}>
            <Text variant="headingMedium">Recent</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear all recent searches"
              onPress={() => {
                Haptics.selectionAsync();
                onClear();
              }}
            >
              <Text variant="label" color={colors.primary}>Clear all</Text>
            </Pressable>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text variant="headingMedium">Find your people</Text>
          <Text variant="bodySmall" color={colors.textSecondary}>
            Search by name or username.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.identity}
            activeOpacity={0.76}
            onPress={() => {
              Haptics.selectionAsync();
              onSelect(item);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.display_name || item.username}'s profile`}
          >
            <ProfileAvatar profile={item} size={46} />
            <View style={styles.names}>
              <Text variant="subhead" numberOfLines={1}>{item.display_name || item.username}</Text>
              <Text variant="bodySmall" color={colors.textSecondary} numberOfLines={1}>
                @{item.username}
              </Text>
            </View>
          </TouchableOpacity>
          <Pressable
            style={({ pressed }) => [styles.remove, pressed && { opacity: 0.55 }]}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.username} from recent searches`}
            onPress={() => onRemove(item.id)}
          >
            <IconClose size={18} color={colors.textTertiary} />
          </Pressable>
        </View>
      )}
    />
  );
}
