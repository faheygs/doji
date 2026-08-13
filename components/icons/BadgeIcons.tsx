import React from 'react';
import Svg, { Path, Circle, Line, Polyline, Rect } from 'react-native-svg';
import { FIRE_PATH } from './iconPaths';

type P = { size?: number; color: string };

export function IcnFlame({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d={FIRE_PATH} fill="none" />
    </Svg>
  );
}

export function IcnTarget({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Circle cx="12" cy="12" r="10" />
      <Circle cx="12" cy="12" r="6" />
      <Circle cx="12" cy="12" r="2" />
    </Svg>
  );
}

export function IcnTrophy({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M6 9H4a2 2 0 0 1-2-2V5h4" />
      <Path d="M18 9h2a2 2 0 0 0 2-2V5h-4" />
      <Path d="M4 5h16v4a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6V5z" />
      <Line x1="12" y1="15" x2="12" y2="19" />
      <Line x1="8" y1="19" x2="16" y2="19" />
    </Svg>
  );
}

export function IcnStar({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" />
    </Svg>
  );
}

export function IcnBolt({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="m13.8 2.5-8.5 10h6.2l-1.1 9 8.3-10.7h-6.1l1.2-8.3Z" />
    </Svg>
  );
}

export function IcnShield({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M12 2.5 20 5.8v5.9c0 4.8-3.2 7.9-8 9.8-4.8-1.9-8-5-8-9.8V5.8l8-3.3Z" />
      <Path d="m8.5 12 2.2 2.2 4.8-5" />
    </Svg>
  );
}

export function IcnHeart({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

export function IcnCrown({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M3.5 18.5 5.2 6l4 4.2L12 3l2.8 7.2 4-4.2 1.7 12.5h-17Z" />
      <Path d="M4 21h16" />
    </Svg>
  );
}

export function IcnRocket({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M9 15 6.5 12.5c1.2-3 3-5.5 5.3-7.3C14.7 3 18 2.4 21 2.5c.1 3-.5 6.3-2.7 9.2-1.8 2.3-4.3 4.1-7.3 5.3L9 15Z" />
      <Circle cx="15.8" cy="7.7" r="2.2" />
      <Path d="M8 13H4.5L2.8 17l4.4-.3M11.3 16.8 11 21.2l4-1.7V16M7.2 17c-1.8.3-3.1 1.6-3.4 3.4 1.8-.3 3.1-1.6 3.4-3.4Z" />
    </Svg>
  );
}

export function IcnUsers({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <Circle cx="9" cy="7" r="4" />
      <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  );
}

export function IcnBarChart({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Rect x="4" y="14" width="4" height="8" rx="1" />
      <Rect x="10" y="8" width="4" height="14" rx="1" />
      <Rect x="16" y="2" width="4" height="20" rx="1" />
    </Svg>
  );
}

export function IcnDiamond({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M6 3h12l4 6-10 13L2 9z" />
      <Path d="M2 9h20" />
      <Path d="M10 3l-4 6 6 13 6-13-4-6" />
    </Svg>
  );
}

export function IcnMedal({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Circle cx="12" cy="15" r="6" />
      <Path d="M8.21 13.89L7 2h10l-1.21 11.89" />
      <Polyline points="15 8 9 8" />
    </Svg>
  );
}

export function IcnZap({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Circle cx="12" cy="12" r="9.5" />
      <Path d="m13.2 5.2-4.5 6h3.5l-.6 7.5 4.3-6.4h-3.4l.7-7.1Z" fill={color} stroke="none" />
    </Svg>
  );
}

export function IcnCheck({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Circle cx="12" cy="12" r="10" />
      <Path d="M9 12l2 2 4-4" />
    </Svg>
  );
}

export function IcnMegaphone({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M3 11l18-5v12L3 13v-2z" />
      <Path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </Svg>
  );
}

export function IcnGlobe({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Circle cx="12" cy="12" r="9.5" />
      <Path d="M3 12h18M4.6 7.5h14.8M4.6 16.5h14.8M12 2.5c2.3 2.5 3.5 5.6 3.5 9.5s-1.2 7-3.5 9.5c-2.3-2.5-3.5-5.6-3.5-9.5S9.7 5 12 2.5Z" />
    </Svg>
  );
}

export function IcnGamepad({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M6 7h12a4 4 0 0 1 3.8 5.2l-1.6 5.2a2.5 2.5 0 0 1-4.1 1.1L14.5 17h-5l-1.6 1.5a2.5 2.5 0 0 1-4.1-1.1l-1.6-5.2A4 4 0 0 1 6 7Z" />
      <Path d="M6.2 12h4M8.2 10v4" />
      <Circle cx="16.2" cy="11" r="1" fill={color} stroke="none" />
      <Circle cx="18.3" cy="13.2" r="1" fill={color} stroke="none" />
    </Svg>
  );
}

export function IcnThumbsUp({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
      <Path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </Svg>
  );
}

export function IcnAward({ size = 24, color }: P) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Circle cx="12" cy="9" r="6.5" />
      <Path
        d="m12 5.7 1 2 2.2.3-1.6 1.6.4 2.2-2-1.1-2 1.1.4-2.2L8.8 8l2.2-.3 1-2Z"
        fill={color}
        stroke="none"
      />
      <Path d="m8.2 14.1-1 7.4 4.8-2.6 4.8 2.6-1-7.4" />
    </Svg>
  );
}

const BADGE_ICON_MAP: Record<string, React.ComponentType<P>> = {
  early_bird: IcnBolt,
  on_fire: IcnFlame,
  century: IcnTarget,
  poll_star: IcnBarChart,
  beloved: IcnHeart,
  speedster: IcnRocket,
  streak_3: IcnFlame,
  streak_14: IcnDiamond,
  streak_30: IcnTrophy,
  streak_100: IcnCrown,
  first_one: IcnCheck,
  ten_done: IcnTarget,
  fifty_done: IcnStar,
  two_fifty: IcnMedal,
  five_hundred: IcnCrown,
  xp_1000: IcnZap,
  xp_5000: IcnRocket,
  xp_10000: IcnStar,
  first_react: IcnThumbsUp,
  react_100: IcnMegaphone,
  beloved_100: IcnHeart,
  beloved_500: IcnHeart,
  poll_10: IcnBarChart,
  poll_100: IcnBarChart,
  social_1: IcnUsers,
  social_10: IcnUsers,
  social_50: IcnGlobe,
  level_5: IcnGamepad,
  level_10: IcnAward,
};

export function BadgeIcon({
  badgeId,
  size = 24,
  color,
}: {
  badgeId: string;
  size?: number;
  color: string;
}) {
  const Icon = BADGE_ICON_MAP[badgeId] ?? IcnStar;
  return <Icon size={size} color={color} />;
}

const CATEGORY_ICON_MAP: Record<string, React.ComponentType<P>> = {
  streak: IcnFlame,
  completions: IcnTarget,
  xp: IcnRocket,
  reactions_received: IcnHeart,
  reactions_given: IcnMegaphone,
  poll_votes: IcnBarChart,
  social: IcnUsers,
  level: IcnGamepad,
  ideas: IcnBolt,
};

export function CategoryBadgeIcon({
  categoryId,
  size = 24,
  color,
}: {
  categoryId: string;
  size?: number;
  color: string;
}) {
  const Icon = CATEGORY_ICON_MAP[categoryId] ?? IcnStar;
  return <Icon size={size} color={color} />;
}
