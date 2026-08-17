import { StyleSheet, View } from 'react-native';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Skeleton } from '../ui/Skeleton';

export function NotificationListSkeleton() {
  const { colors } = useTheme();
  return (
    <View
      style={styles.list}
      pointerEvents="none"
      accessibilityRole="progressbar"
      accessibilityLabel="Loading notifications"
    >
      {[0, 1, 2, 3].map((row) => (
        <View key={row} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Skeleton width={44} height={44} radius={22} />
          <View style={styles.copy}>
            <Skeleton width={row === 0 ? '62%' : '42%'} height={15} />
            <Skeleton width={row === 0 ? '76%' : '68%'} height={12} />
            <Skeleton width="32%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.md, gap: Spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  copy: { flex: 1, gap: Spacing.sm, paddingTop: 2 },
});
