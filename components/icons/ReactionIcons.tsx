import React from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { normalizeReactionEmoji } from '../../lib/reactionEmoji';
import { FIRE_PATH } from './iconPaths';

export type ReactionIconProps = {
  size?: number;
  color: string;
  /** Selected glyph treatment when true; default outline when false. */
  filled?: boolean;
};

type ReactionKey = 'fire' | 'like' | 'dislike' | 'laugh' | 'wow' | 'heart';

function FireGlyph({ filled, color }: Required<Pick<ReactionIconProps, 'filled' | 'color'>>) {
  if (filled) {
    return <Path d={FIRE_PATH} fill={color} />;
  }

  return (
    <Path
      d={FIRE_PATH}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function ThumbsUpGlyph({ filled, color }: Required<Pick<ReactionIconProps, 'filled' | 'color'>>) {
  if (filled) {
    return (
      <Path
        d="M8.2 10.2 11 3.7c.4-.9 1.3-1.5 2.3-1.4 1.4.1 2.4 1.3 2.2 2.7L15 8.3h4.3c1.7 0 2.9 1.6 2.5 3.2l-1.7 7.8a2.5 2.5 0 0 1-2.4 2H8.2V10.2ZM2.2 10.6h4.2v10.7H4.5A2.3 2.3 0 0 1 2.2 19v-8.4Z"
        fill={color}
      />
    );
  }

  return (
    <>
      <Path
        d="M8.2 10.2 11 3.7c.4-.9 1.3-1.5 2.3-1.4 1.4.1 2.4 1.3 2.2 2.7L15 8.3h4.3c1.7 0 2.9 1.6 2.5 3.2l-1.7 7.8a2.5 2.5 0 0 1-2.4 2H8.2V10.2Z"
        stroke={color}
        strokeWidth={2.05}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6.4 10.6H4.5A2.3 2.3 0 0 0 2.2 13v6a2.3 2.3 0 0 0 2.3 2.3h1.9V10.6Z"
        stroke={color}
        strokeWidth={2.05}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function LaughGlyph({ filled, color }: Required<Pick<ReactionIconProps, 'filled' | 'color'>>) {
  const strokeWidth = filled ? 2.45 : 2.05;
  return (
    <>
      <Circle cx={12} cy={12} r={9.2} stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M7.2 9.9c.8-1 1.7-1.5 2.8-1.5m4 0c1.1 0 2 .5 2.8 1.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M7.4 14.2c1.1 2.7 2.7 4 4.6 4s3.5-1.3 4.6-4c-1.8.7-3.3 1-4.6 1s-2.8-.3-4.6-1Z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function WowGlyph({ filled, color }: Required<Pick<ReactionIconProps, 'filled' | 'color'>>) {
  const strokeWidth = filled ? 2.45 : 2.05;
  return (
    <>
      <Circle cx={12} cy={12} r={9.2} stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="m7.1 8.2 2.8-.7m4.2 0 2.8.7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Circle cx={9} cy={10.5} r={filled ? 1.45 : 1.1} fill={color} />
      <Circle cx={15} cy={10.5} r={filled ? 1.45 : 1.1} fill={color} />
      <Path
        d="M12 13.2c1.4 0 2.35 1.1 2.35 2.8S13.4 18.8 12 18.8 9.65 17.7 9.65 16s.95-2.8 2.35-2.8Z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={strokeWidth}
      />
    </>
  );
}

function HeartGlyph({ filled, color }: Required<Pick<ReactionIconProps, 'filled' | 'color'>>) {
  return (
    <Path
      d="M12 21 4.6 14.1C2.9 12.5 2 10.8 2 8.8A5.6 5.6 0 0 1 7.7 3.2c1.8 0 3.2.8 4.3 2.2 1.1-1.4 2.5-2.2 4.3-2.2A5.6 5.6 0 0 1 22 8.8c0 2-.9 3.7-2.6 5.3L12 21Z"
      fill={filled ? color : 'none'}
      stroke={filled ? 'none' : color}
      strokeWidth={filled ? 0 : 2.05}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function ReactionGlyph({
  emoji,
  size = 22,
  color,
  filled = false,
}: ReactionIconProps & { emoji: ReactionKey }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {emoji === 'fire' ? <FireGlyph filled={filled} color={color} /> : null}
      {emoji === 'like' ? <ThumbsUpGlyph filled={filled} color={color} /> : null}
      {emoji === 'dislike' ? (
        <G transform="rotate(180 12 12)">
          <ThumbsUpGlyph filled={filled} color={color} />
        </G>
      ) : null}
      {emoji === 'laugh' ? <LaughGlyph filled={filled} color={color} /> : null}
      {emoji === 'wow' ? <WowGlyph filled={filled} color={color} /> : null}
      {emoji === 'heart' ? <HeartGlyph filled={filled} color={color} /> : null}
    </Svg>
  );
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
  emoji: ReactionKey;
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
  const def = REACTION_CONTROLS.find((reaction) => reaction.emoji === key);
  if (!def) return null;
  const Icon = def.Icon;
  return <Icon size={size} color={color} filled={filled} />;
}
