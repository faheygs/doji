import { memo } from 'react';
import type { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';

const MENTION_BODY_REGEX = /(@[a-zA-Z0-9_]+)/g;

export const CommentBody = memo(function CommentBody({
  body,
  colors,
  onMentionPress,
}: {
  body: string;
  colors: ReturnType<typeof useTheme>['colors'];
  onMentionPress: (username: string) => void;
}) {
  return (
    <Text variant="body" color={colors.text} style={{ lineHeight: 20 }}>
      {body.split(MENTION_BODY_REGEX).map((part, i) =>
        part.startsWith('@') ? (
          <Text
            key={`${i}-${part}`}
            variant="body"
            color={colors.primary}
            style={{ fontWeight: '600' }}
            onPress={() => onMentionPress(part.slice(1))}
          >
            {part}
          </Text>
        ) : (
          <Text key={`${i}-${part}`}>{part}</Text>
        ),
      )}
    </Text>
  );
});
