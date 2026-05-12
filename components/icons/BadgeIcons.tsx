import React from 'react';
import Svg, { Path, Circle, Line, Polyline, Rect } from 'react-native-svg';

type P = { size?: number; color: string };

export function IcnFlame({ size = 24, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 22c4-2 8-6 8-11a8 8 0 0 0-16 0c0 5 4 9 8 11z" />
      <Path d="M12 22c-1.5-1-3-3-3-5.5a3.5 3.5 0 0 1 6 0c0 2.5-1.5 4.5-3 5.5z" />
    </Svg>
  );
}

export function IcnTarget({ size = 24, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Circle cx="12" cy="12" r="6" />
      <Circle cx="12" cy="12" r="2" />
    </Svg>
  );
}

export function IcnTrophy({ size = 24, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
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
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" />
    </Svg>
  );
}

export function IcnBolt({ size = 24, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </Svg>
  );
}

export function IcnShield({ size = 24, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Svg>
  );
}

export function IcnHeart({ size = 24, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

export function IcnCrown({ size = 24, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2 20h20" />
      <Path d="M4 17l2-12 4 5 2-7 2 7 4-5 2 12H4z" />
    </Svg>
  );
}

export function IcnRocket({ size = 24, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <Path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <Path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <Path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </Svg>
  );
}

export function IcnUsers({ size = 24, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <Circle cx="9" cy="7" r="4" />
      <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  );
}

export function IcnBarChart({ size = 24, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="4" y="14" width="4" height="8" rx="1" />
      <Rect x="10" y="8" width="4" height="14" rx="1" />
      <Rect x="16" y="2" width="4" height="20" rx="1" />
    </Svg>
  );
}

export function IcnDiamond({ size = 24, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 3h12l4 6-10 13L2 9z" />
      <Path d="M2 9h20" />
      <Path d="M10 3l-4 6 6 13 6-13-4-6" />
    </Svg>
  );
}

export function IcnMedal({ size = 24, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="15" r="6" />
      <Path d="M8.21 13.89L7 2h10l-1.21 11.89" />
      <Polyline points="15 8 9 8" />
    </Svg>
  );
}

export function IcnZap({ size = 24, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </Svg>
  );
}

export function IcnCheck({ size = 24, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Path d="M9 12l2 2 4-4" />
    </Svg>
  );
}

export function IcnMegaphone({ size = 24, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 11l18-5v12L3 13v-2z" />
      <Path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </Svg>
  );
}

export function IcnGlobe({ size = 24, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Line x1="2" y1="12" x2="22" y2="12" />
      <Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Svg>
  );
}

export function IcnGamepad({ size = 24, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="2" y="6" width="20" height="12" rx="2" />
      <Line x1="6" y1="12" x2="10" y2="12" />
      <Line x1="8" y1="10" x2="8" y2="14" />
      <Line x1="15" y1="11" x2="15" y2="11.01" />
      <Line x1="18" y1="13" x2="18" y2="13.01" />
    </Svg>
  );
}

export function IcnThumbsUp({ size = 24, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
      <Path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </Svg>
  );
}

export function IcnAward({ size = 24, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="8" r="6" />
      <Path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" />
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

export function BadgeIcon({ badgeId, size = 24, color }: { badgeId: string; size?: number; color: string }) {
  const Icon = BADGE_ICON_MAP[badgeId] ?? IcnStar;
  return <Icon size={size} color={color} />;
}
