import React, { useMemo } from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { IconCheck, IconCamera } from '../icons/Icons';
import { IcnBarChart } from '../icons/BadgeIcons';
import { UserEvent } from '../../types/database';
import { isExpired } from '../../utils/time';

type Props = {
  userEvent: UserEvent | null;
};

const TYPE_LABEL: Record<string, string> = {
  photo: 'Photo',
  poll: 'Poll',
  task: 'Task',
};

function TypeIcon({ type, size, color }: { type: string; size: number; color: string }) {
  if (type === 'poll') return <IcnBarChart size={size} color={color} />;
  if (type === 'task') return <IconCheck size={size} color={color} />;
  return <IconCamera size={size} color={color} />;
}

export function ChallengeBanner({ userEvent }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrapper: {
          marginHorizontal: Spacing.md,
          marginBottom: Spacing.sm,
          borderRadius: Radius.lg,
          overflow: 'hidden',
        },
        banner: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: Spacing.md,
          paddingHorizontal: Spacing.md,
          gap: Spacing.sm,
        },
        bannerBody: { flex: 1, gap: 2 },
        noChallenge: {
          backgroundColor: colors.surfaceElevated,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radius.lg,
          marginHorizontal: Spacing.md,
          marginBottom: Spacing.sm,
          padding: Spacing.md,
        },
        completedBanner: {
          backgroundColor: `${colors.success}14`,
          borderWidth: 1,
          borderColor: `${colors.success}59`,
          borderRadius: Radius.lg,
          marginHorizontal: Spacing.md,
          marginBottom: Spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          padding: Spacing.md,
          gap: Spacing.sm,
        },
        missedBanner: {
          backgroundColor: colors.surfaceMuted,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radius.lg,
          marginHorizontal: Spacing.md,
          marginBottom: Spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          padding: Spacing.md,
          gap: Spacing.sm,
        },
        checkCircle: {
          width: 36,
          height: 36,
          borderRadius: 18,
          borderWidth: 2,
          borderColor: colors.success,
          alignItems: 'center',
          justifyContent: 'center',
        },
        iconCircle: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: 'rgba(255,255,255,0.15)',
          alignItems: 'center',
          justifyContent: 'center',
        },
        metaRow: {
          flexDirection: 'row',
          gap: Spacing.sm,
          marginTop: 4,
        },
        metaPill: {
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: Radius.full,
          backgroundColor: 'rgba(255,255,255,0.2)',
        },
        timer: { alignItems: 'flex-end' },
      }),
    [colors],
  );

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(app)/challenge');
  };

  if (!userEvent) {
    return (
      <View style={styles.noChallenge}>
        <Text variant="micro" color={colors.textTertiary}>NEXT CHALLENGE</Text>
        <Text variant="body" color={colors.textSecondary} style={{ marginTop: 4 }}>
          Check back soon
        </Text>
      </View>
    );
  }

  const challenge = userEvent.challenge;
  const challengeType = challenge?.type ?? 'photo';
  const xpReward = challenge?.xp_reward ?? 50;
  const participants = challenge?.participant_count ?? 0;

  if (userEvent.status === 'completed' || userEvent.status === 'late') {
    return (
      <View style={styles.completedBanner}>
        <View style={styles.checkCircle}>
          <IconCheck size={18} color={colors.success} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="micro" color={colors.success}>COMPLETE</Text>
          <Text variant="body" color={colors.textSecondary}>
            +{xpReward} XP earned
          </Text>
        </View>
      </View>
    );
  }

  if (userEvent.status === 'missed' || isExpired(userEvent.expires_at)) {
    return (
      <View style={styles.missedBanner}>
        <View style={{ flex: 1 }}>
          <Text variant="micro" color={colors.textSecondary}>MISSED</Text>
          <Text variant="body" color={colors.textSecondary}>Next drop coming soon</Text>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.92} style={styles.wrapper}>
      <LinearGradient
        colors={[colors.xpGradientStart, colors.xpGradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.banner}
      >
        <View style={styles.iconCircle}>
          <TypeIcon type={challengeType} size={24} color="#FFFFFF" />
        </View>
        <View style={styles.bannerBody}>
          <Text variant="micro" style={{ color: 'rgba(255,255,255,0.8)' }}>
            {TYPE_LABEL[challengeType] ?? 'Challenge'}
          </Text>
          <Text variant="subhead" style={{ color: '#FFFFFF' }} numberOfLines={1}>
            {challenge?.title ?? 'Challenge'}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <Text variant="nano" style={{ color: '#FFFFFF' }}>+{xpReward} XP</Text>
            </View>
            {participants > 0 && (
              <View style={styles.metaPill}>
                <Text variant="nano" style={{ color: '#FFFFFF' }}>{participants} joined</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.timer}>
          <Text variant="subhead" style={{ color: '#FFFFFF' }}>
            GO →
          </Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}
