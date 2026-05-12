import React, { useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Modal,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { Typography, Spacing, Radius } from '../../constants/theme';
import { IconCamera, IconCheck } from '../icons/Icons';
import { IcnBarChart, IcnTarget } from '../icons/BadgeIcons';
import type { Challenge, DailyEvent } from '../../types/database';

type Props = {
  visible: boolean;
  challenge: Challenge;
  event: DailyEvent;
  timeLeft: string;
  onStartPhoto: () => void;
  onStartPoll: () => void;
  onStartTask: () => void;
  onDismiss: () => void;
};

const TYPE_LABEL: Record<string, string> = {
  photo: 'Photo Challenge',
  poll: 'Poll',
  task: 'Task',
};

function TypeIcon({ type, color }: { type: string; color: string }) {
  if (type === 'poll') return <IcnBarChart size={36} color={color} />;
  if (type === 'task') return <IconCheck size={36} color={color} />;
  return <IconCamera size={36} color={color} />;
}

export function ChallengeReveal({
  visible,
  challenge,
  timeLeft,
  onStartPhoto,
  onStartPoll,
  onStartTask,
  onDismiss,
}: Props) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.85);
      opacity.setValue(0);
    }
  }, [visible]);

  const onCTA = () => {
    if (challenge.type === 'poll') return onStartPoll();
    if (challenge.type === 'task') return onStartTask();
    return onStartPhoto();
  };

  const ctaLabel =
    challenge.type === 'poll'
      ? 'Vote Now'
      : challenge.type === 'task'
        ? "Let's Do It"
        : 'Open Camera';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              transform: [{ scale }],
              opacity,
            },
          ]}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.primaryPale }]}>
            <TypeIcon type={challenge.type} color={colors.primary} />
          </View>

          <View style={[styles.typeBadge, { backgroundColor: colors.surfaceMuted }]}>
            <Text variant="micro" color={colors.textSecondary}>
              {TYPE_LABEL[challenge.type] ?? 'Challenge'}
            </Text>
          </View>

          <Text variant="title" style={{ textAlign: 'center', marginTop: Spacing.md }}>
            {challenge.title}
          </Text>

          {challenge.description ? (
            <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center', marginTop: Spacing.xs }}>
              {challenge.description}
            </Text>
          ) : null}

          <View style={styles.metaRow}>
            <View style={[styles.metaPill, { backgroundColor: colors.primaryPale }]}>
              <Text variant="micro" color={colors.primary}>
                +{challenge.xp_reward} XP
              </Text>
            </View>
            <View style={[styles.metaPill, { backgroundColor: colors.surfaceMuted }]}>
              <Text variant="micro" color={colors.textSecondary}>
                {timeLeft}
              </Text>
            </View>
            {challenge.participant_count > 0 && (
              <View style={[styles.metaPill, { backgroundColor: colors.surfaceMuted }]}>
                <Text variant="micro" color={colors.textSecondary}>
                  {challenge.participant_count} joined
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={onCTA}
            style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
          >
            <Text variant="subhead" color={colors.onPrimary}>{ctaLabel}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onDismiss} style={styles.dismissBtn}>
            <Text variant="caption" color={colors.textTertiary}>Maybe later</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  metaRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  metaPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  ctaBtn: {
    width: '100%',
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
  },
  dismissBtn: {
    marginTop: Spacing.md,
    padding: Spacing.sm,
  },
});
