import { StyleSheet, View } from 'react-native';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import type { Challenge } from '../../types/database';
import { IconLock } from '../icons/Icons';
import { Text } from '../ui/Text';

type PreviewChallenge = Pick<Challenge, 'type' | 'requires_photo' | 'requires_video'>;

/** Locked previews contain metadata only; never inspect or load a hidden answer. */
export function LockedPostBody({ challenge }: { challenge?: PreviewChallenge | null }) {
  const { colors } = useTheme();
  const textOnly =
    (challenge?.type === 'task' || challenge?.type === 'format') &&
    !challenge.requires_photo &&
    !challenge.requires_video;
  return (
    <View
      style={[
        styles.body,
        textOnly ? styles.textBody : styles.mediaBody,
        { backgroundColor: colors.background },
      ]}
      accessibilityRole="text"
      accessibilityLabel={
        textOnly
          ? "Text response hidden. Complete today's challenge to read it."
          : "Complete today's challenge to see this post"
      }
    >
      {textOnly ? (
        <View
          style={[styles.answer, { borderLeftColor: colors.primary }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {(['92%', '76%', '54%'] as const).map((width) => (
            <View
              key={width}
              style={[styles.line, { width, backgroundColor: colors.surfaceMuted }]}
            />
          ))}
        </View>
      ) : null}
      <IconLock size={textOnly ? 24 : 32} color={colors.textSecondary} />
      <Text variant="bodySmall" color={colors.textSecondary} style={styles.message}>
        {textOnly ? 'Text response hidden' : 'Do it and see'}
      </Text>
      <Text variant="micro" color={colors.textTertiary} style={styles.message}>
        {"Finish today's challenge first."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  mediaBody: { aspectRatio: 1 },
  textBody: { padding: Spacing.lg },
  // Fixed decorative lines reveal neither an answer's length nor its content.
  answer: {
    width: '100%',
    borderLeftWidth: 3,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  line: { height: 12, borderRadius: Radius.sm },
  message: { textAlign: 'center', lineHeight: 20 },
});
