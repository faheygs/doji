import { StyleSheet, View } from 'react-native';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { Text } from '../ui/Text';
import { useDojiContributor } from '../../hooks/useDojiContributor';

import type { DojiContributor } from '../../lib/dojiContributor';
export type { DojiContributor } from '../../lib/dojiContributor';

export function ConnectedDojiContributorCredit({ eventId }: { eventId: string | undefined }) {
  const contributor = useDojiContributor(eventId);
  return <DojiContributorCredit contributor={contributor.data ?? null} />;
}

/** Presentation only: callers must supply authorized attribution, never infer authorship. */
export function DojiContributorCredit({ contributor }: { contributor: DojiContributor | null }) {
  const { colors } = useTheme();
  if (!contributor) return null;
  return (
    <View
      accessible
      accessibilityLabel={`Today's Doji brought to you by @${contributor.username}`}
      style={[styles.card, { backgroundColor: colors.primaryPale, borderColor: colors.border }]}
    >
      <ProfileAvatar profile={contributor} size={44} />
      <View style={styles.copy}>
        <Text variant="bodySmall" color={colors.textSecondary}>
          Brought to you by
        </Text>
        <Text variant="headingMedium" color={colors.text}>
          @{contributor.username}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    width: '100%',
  },
  copy: { flex: 1, gap: Spacing.xs },
});
