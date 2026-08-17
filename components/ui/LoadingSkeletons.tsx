import { StyleSheet, View } from 'react-native';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Skeleton } from './Skeleton';

function LoadingRegion({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View pointerEvents="none" accessibilityRole="progressbar" accessibilityLabel={label}>
      {children}
    </View>
  );
}

export function ListRowsSkeleton({ rows = 5, label = 'Loading list' }: { rows?: number; label?: string }) {
  const { colors } = useTheme();
  return (
    <LoadingRegion label={label}>
      <View style={styles.list}>
        {Array.from({ length: rows }, (_, index) => (
          <View key={index} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Skeleton width={52} height={52} radius={26} />
            <View style={styles.copy}>
              <Skeleton width={`${42 + (index % 2) * 12}%`} height={15} />
              <Skeleton width="34%" height={11} />
            </View>
            <Skeleton width={72} height={32} radius={Radius.full} />
          </View>
        ))}
      </View>
    </LoadingRegion>
  );
}

export function ProfileSkeleton() {
  return (
    <LoadingRegion label="Loading profile">
      <View style={styles.profile}>
        <View style={styles.profileHeader}>
          <Skeleton width={112} height={112} radius={56} />
          <View style={styles.profileCopy}>
            <Skeleton width="64%" height={20} />
            <Skeleton width="42%" height={13} />
          </View>
        </View>
        <Skeleton height={10} radius={Radius.full} />
        <View style={styles.stats}>
          {[0, 1, 2].map((item) => <Skeleton key={item} width="29%" height={78} radius={Radius.md} />)}
        </View>
        <Skeleton width="28%" height={20} />
        <View style={styles.grid}>
          {[0, 1, 2, 3, 4, 5].map((item) => <Skeleton key={item} width="31%" height={132} radius={Radius.md} />)}
        </View>
      </View>
    </LoadingRegion>
  );
}

export function ShopSkeleton() {
  return (
    <LoadingRegion label="Loading shop">
      <View style={styles.shop}>
        <Skeleton height={126} radius={Radius.lg} />
        <Skeleton width="38%" height={22} />
        <View style={styles.grid}>
          {[0, 1, 2, 3].map((item) => <Skeleton key={item} width="48%" height={220} radius={Radius.lg} />)}
        </View>
      </View>
    </LoadingRegion>
  );
}

export function LeaderboardSkeleton() {
  return (
    <LoadingRegion label="Loading leaderboard">
      <View style={styles.leaderboard}>
        <View style={styles.podium}>
          {[72, 92, 72].map((size, index) => <Skeleton key={index} width={size} height={size} radius={size / 2} />)}
        </View>
        {[0, 1, 2].map((item) => <Skeleton key={item} height={96} radius={Radius.lg} />)}
      </View>
    </LoadingRegion>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.md, gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth },
  copy: { flex: 1, gap: Spacing.sm },
  profile: { padding: Spacing.lg, gap: Spacing.lg },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  profileCopy: { flex: 1, gap: Spacing.sm },
  stats: { flexDirection: 'row', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: Spacing.sm },
  shop: { padding: Spacing.md, gap: Spacing.lg },
  leaderboard: { padding: Spacing.md, gap: Spacing.sm },
  podium: { minHeight: 150, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', paddingVertical: Spacing.md },
});
