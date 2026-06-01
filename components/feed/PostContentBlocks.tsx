import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { ChallengeTypeGlyph } from '../challenge/ChallengeTypeGlyph';
import type { Challenge } from '../../types/database';
import { formatRuleHint, parseAnswerRule } from '../../lib/answerRules';

type QuestionProps = {
  challenge: Challenge;
};

export function PostQuestionBlock({ challenge }: QuestionProps) {
  const { colors } = useTheme();
  const rule = challenge.type === 'format' ? parseAnswerRule(challenge.answer_rule) : null;
  const ruleLabel = rule ? formatRuleHint(rule) : null;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        block: {
          marginHorizontal: Spacing.md,
          marginTop: Spacing.xs,
          marginBottom: Spacing.sm,
          gap: 6,
        },
        labelRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.xs,
        },
        questionText: {
          lineHeight: 22,
        },
      }),
    [],
  );

  return (
    <View style={styles.block}>
      <View style={styles.labelRow}>
        <ChallengeTypeGlyph type={challenge.type} title={challenge.title} size={14} color={colors.primary} />
        <Text variant="micro" color={colors.textTertiary} style={{ fontWeight: '700', letterSpacing: 0.6 }}>
          QUESTION
        </Text>
      </View>
      <Text variant="headingMedium" color={colors.text} style={styles.questionText}>
        {challenge.title}
      </Text>
      {ruleLabel ? (
        <Text variant="micro" color={colors.textTertiary} style={{ lineHeight: 18 }}>
          {ruleLabel}
        </Text>
      ) : null}
    </View>
  );
}

type AnswerProps = {
  caption: string;
};

export function PostAnswerBlock({ caption }: AnswerProps) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        block: {
          marginHorizontal: Spacing.md,
          marginBottom: Spacing.sm,
          gap: 6,
        },
        answerBody: {
          paddingLeft: Spacing.sm,
          paddingVertical: Spacing.sm,
          paddingRight: Spacing.sm + 2,
          borderLeftWidth: 3,
          borderLeftColor: colors.primary,
          borderRadius: Radius.sm,
          backgroundColor: `${colors.primary}08`,
        },
      }),
    [colors.primary],
  );

  return (
    <View style={styles.block}>
      <Text variant="micro" color={colors.textTertiary} style={{ fontWeight: '700', letterSpacing: 0.6 }}>
        ANSWER
      </Text>
      <View style={styles.answerBody}>
        <Text variant="body" color={colors.text} style={{ lineHeight: 20 }}>
          {caption}
        </Text>
      </View>
    </View>
  );
}

type PromptProps = {
  title: string;
};

export function PostPhotoPrompt({ title }: PromptProps) {
  const { colors } = useTheme();
  return (
    <Text
      variant="micro"
      color={colors.textTertiary}
      style={{
        marginHorizontal: Spacing.md,
        marginBottom: Spacing.sm,
        lineHeight: 18,
      }}
    >
      {title}
    </Text>
  );
}
