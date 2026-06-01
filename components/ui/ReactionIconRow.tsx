import React from 'react';
import { View, StyleSheet } from 'react-native';
import { REACTION_CONTROLS } from '../icons/Icons';
import { reactionEmojiIconColors } from '../../lib/reactionColors';
import { normalizeReactionEmoji } from '../../lib/reactionEmoji';
import type { AppColors } from '../../constants/theme';
import type { ReactionEmoji } from '../../types/database';

type Props = {
  emojis: string[];
  colors: AppColors;
  size?: number;
  max?: number;
};

export function ReactionIconRow({ emojis, colors, size = 16, max = 5 }: Props) {
  const tints = reactionEmojiIconColors(colors);
  const shown = emojis.slice(0, max);

  return (
    <View style={styles.row}>
      {shown.map((emoji) => {
        const normalized = normalizeReactionEmoji(emoji);
        const def = REACTION_CONTROLS.find((r) => r.emoji === normalized);
        if (!def) return null;
        const Icon = def.Icon;
        return (
          <View key={emoji} style={styles.iconWrap}>
            <Icon
              size={size}
              color={tints[(normalized ?? emoji) as ReactionEmoji] ?? colors.textSecondary}
              filled
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
