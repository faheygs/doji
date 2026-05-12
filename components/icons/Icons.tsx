import React from 'react';
import Svg, { Circle, Path, Line, Rect } from 'react-native-svg';

export type IconProps = {
  size?: number;
  color: string;
};

export const REACTION_ICON_TINT: Record<string, string> = {
  fire: '#F97316',
  laugh: '#CA8A04',
  wow: '#3B82F6',
  love: '#DC2626',
};

export function IconHome({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 21v-8h6v8M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-8H9v8H5a1 1 0 0 1-1-1v-9.5Z"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconFriends({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={7} r={3} stroke={color} strokeWidth={1.65} />
      <Path
        d="M3 19v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
      />
      <Path d="M15.5 11a3 3 0 1 0 0-6" stroke={color} strokeWidth={1.65} strokeLinecap="round" />
      <Path d="M21 19v-1a4 4 0 0 0-3-3.87" stroke={color} strokeWidth={1.65} strokeLinecap="round" />
    </Svg>
  );
}

export function IconProfile({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={1.65} />
      <Path
        d="M6 20v-1a6 6 0 0 1 12 0v1"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function IconTrophy({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 9H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M18 9h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6 4h12v6a6 6 0 0 1-12 0V4ZM9 20h6M12 16v4"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconBolt({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconUsers({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={7} r={3} stroke={color} strokeWidth={1.65} />
      <Circle cx={17} cy={7} r={3} stroke={color} strokeWidth={1.65} />
      <Path d="M3 19v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" stroke={color} strokeWidth={1.65} strokeLinecap="round" />
      <Path d="M19 14a5 5 0 0 1 3 4.5V19" stroke={color} strokeWidth={1.65} strokeLinecap="round" />
    </Svg>
  );
}

export function IconSend({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconSettings({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconChevronLeft({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 6 9 12l6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconChevronRight({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m9 6 6 6-6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconFlipCamera({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16 17h3v-3M8 7H5v3M21 15c-.9 2.3-3 4-5.8 4-3 0-5.5-2.2-6.3-5M3 9c.9-2.3 3-4 5.8-4 3 0 5.5 2.2 6.3 5"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconTimer({ size = 18, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.65} />
      <Path d="M12 7v6l4 2" stroke={color} strokeWidth={1.65} strokeLinecap="round" />
    </Svg>
  );
}

export function IconSearch({ size = 40, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={1.65} />
      <Path d="m20 20-4.3-4.3" stroke={color} strokeWidth={1.65} strokeLinecap="round" />
    </Svg>
  );
}

export function IconCheck({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m5 13 4 4L19 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconClose({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m6 6 12 12M18 6 6 18" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function IconLock({ size = 28, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M7 11V8a5 5 0 0 1 10 0v3" stroke={color} strokeWidth={1.65} strokeLinecap="round" />
      <Path d="M6 11h12v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V11Z" stroke={color} strokeWidth={1.65} strokeLinejoin="round" />
      <Circle cx={12} cy={16} r={1.25} fill={color} />
    </Svg>
  );
}

export function IconBell({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" stroke={color} strokeWidth={1.65} strokeLinecap="round" />
    </Svg>
  );
}

export function IconComment({ size = 18, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M21 12a8 8 0 0 1-8 8H8l-5 3v-3a8 8 0 1 1 18-8Z" stroke={color} strokeWidth={1.65} strokeLinejoin="round" />
    </Svg>
  );
}

export function IconCamera({ size = 36, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 9h3l2-2h6l2 2h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={13} r={3.5} stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

export function IconDoc({ size = 40, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 2H8a2 2 0 0 0-2 2v16l4-2 4 2V4a2 2 0 0 0-2-2Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path d="M10 9h4M10 13h4" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function IconReactionFire({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
        stroke={color}
        fill="none"
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function IconReactionLaugh({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9.25} stroke={color} strokeWidth={1.65} />
      <Path
        d="M18 13a6 6 0 0 1-6 5 6 6 0 0 1-6-5h12Z"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Circle cx={9} cy={9} r={1.2} stroke={color} strokeWidth={1.5} fill="none" />
      <Circle cx={15} cy={9} r={1.2} stroke={color} strokeWidth={1.5} fill="none" />
      <Line x1={5} y1={11.5} x2={4} y2={13.8} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={19} y1={11.5} x2={20} y2={13.8} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function IconReactionWow({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9.25} stroke={color} strokeWidth={1.65} />
      <Circle cx={9} cy={9} r={1.2} stroke={color} strokeWidth={1.5} fill="none" />
      <Circle cx={15} cy={9} r={1.2} stroke={color} strokeWidth={1.5} fill="none" />
      <Circle cx={12} cy={16} r={2} stroke={color} strokeWidth={1.65} fill="none" />
    </Svg>
  );
}

function IconReactionHeart({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
        stroke={color}
        fill="none"
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export const REACTION_CONTROLS: {
  emoji: string;
  label: string;
  Icon: React.ComponentType<IconProps>;
}[] = [
  { emoji: 'fire', label: 'Fire', Icon: IconReactionFire },
  { emoji: 'laugh', label: 'Funny', Icon: IconReactionLaugh },
  { emoji: 'wow', label: 'Wow', Icon: IconReactionWow },
  { emoji: 'love', label: 'Love', Icon: IconReactionHeart },
];
