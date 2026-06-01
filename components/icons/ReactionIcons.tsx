import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { normalizeReactionEmoji } from '../../lib/reactionEmoji';

export type ReactionIconProps = {
  size?: number;
  color: string;
  /** Solid glyph when true; outline when false. */
  filled?: boolean;
};

type MciName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const REACTION_GLYPHS: Record<
  string,
  { outline: MciName; filled: MciName; label: string }
> = {
  fire: { outline: 'fire', filled: 'fire', label: 'Fire' },
  like: { outline: 'thumb-up-outline', filled: 'thumb-up', label: 'Like' },
  dislike: { outline: 'thumb-down-outline', filled: 'thumb-down', label: 'Dislike' },
  laugh: { outline: 'emoticon-lol-outline', filled: 'emoticon-lol', label: 'Laugh' },
  wow: { outline: 'emoticon-excited-outline', filled: 'emoticon-excited', label: 'Wow' },
  heart: { outline: 'heart-outline', filled: 'heart', label: 'Heart' },
};

function ReactionGlyph({
  emoji,
  size = 22,
  color,
  filled = false,
}: ReactionIconProps & { emoji: string }) {
  const key = normalizeReactionEmoji(emoji) ?? emoji;
  const glyph = REACTION_GLYPHS[key];
  if (!glyph) return null;
  const name = filled ? glyph.filled : glyph.outline;
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

export function IconReactionFire(props: ReactionIconProps) {
  return <ReactionGlyph emoji="fire" {...props} />;
}

export function IconReactionLike(props: ReactionIconProps) {
  return <ReactionGlyph emoji="like" {...props} />;
}

export function IconReactionDislike(props: ReactionIconProps) {
  return <ReactionGlyph emoji="dislike" {...props} />;
}

export function IconReactionLaugh(props: ReactionIconProps) {
  return <ReactionGlyph emoji="laugh" {...props} />;
}

export function IconReactionWow(props: ReactionIconProps) {
  return <ReactionGlyph emoji="wow" {...props} />;
}

export function IconReactionHeart(props: ReactionIconProps) {
  return <ReactionGlyph emoji="heart" {...props} />;
}

export const REACTION_CONTROLS: {
  emoji: string;
  label: string;
  Icon: React.ComponentType<ReactionIconProps>;
}[] = [
  { emoji: 'fire', label: 'Fire', Icon: IconReactionFire },
  { emoji: 'like', label: 'Like', Icon: IconReactionLike },
  { emoji: 'dislike', label: 'Dislike', Icon: IconReactionDislike },
  { emoji: 'laugh', label: 'Laugh', Icon: IconReactionLaugh },
  { emoji: 'wow', label: 'Wow', Icon: IconReactionWow },
  { emoji: 'heart', label: 'Heart', Icon: IconReactionHeart },
];

export function ReactionIcon({
  emoji,
  size = 20,
  color,
  filled = true,
}: {
  emoji: string;
  size?: number;
  color: string;
  filled?: boolean;
}) {
  const key = normalizeReactionEmoji(emoji) ?? emoji;
  const def = REACTION_CONTROLS.find((r) => r.emoji === key);
  if (!def) return null;
  const Icon = def.Icon;
  return <Icon size={size} color={color} filled={filled} />;
}
