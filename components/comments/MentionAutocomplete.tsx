import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { Avatar } from '../ui/Avatar';
import { useMentionSearch } from '../../hooks/useComments';
import type { Profile } from '../../types/database';

type Props = {
  query: string;
  visible: boolean;
  onSelect: (username: string) => void;
};

export function MentionAutocomplete({ query, visible, onSelect }: Props) {
  const { colors } = useTheme();
  const { data: results = [], isPending } = useMentionSearch(query, { enabled: visible });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          marginBottom: Spacing.xs,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.hairline,
          borderRadius: Radius.md,
          backgroundColor: colors.surfaceElevated ?? colors.surface,
          maxHeight: 180,
          overflow: 'hidden',
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          paddingHorizontal: Spacing.sm,
          paddingVertical: Spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
        },
        rowBody: { flex: 1, minWidth: 0 },
        centered: {
          padding: Spacing.md,
          alignItems: 'center',
        },
      }),
    [colors],
  );

  if (!visible) return null;

  const renderItem = ({ item }: { item: Profile }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onSelect(item.username)}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`Mention @${item.username}`}
    >
      <Avatar uri={item.avatar_url} username={item.username} size={32} />
      <View style={styles.rowBody}>
        <Text variant="bodySmall" numberOfLines={1} style={{ fontWeight: '600' }}>
          @{item.username}
        </Text>
        {item.display_name ? (
          <Text variant="micro" color={colors.textTertiary} numberOfLines={1}>
            {item.display_name}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.wrap}>
      {isPending ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.textSecondary} size="small" />
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centered}>
          <Text variant="micro" color={colors.textTertiary}>
            No matches in your network
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="always"
        />
      )}
    </View>
  );
}
