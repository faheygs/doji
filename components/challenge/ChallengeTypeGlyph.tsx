import React from 'react';
import { View, Text } from 'react-native';
import { IconCamera, IconCheck } from '../icons/Icons';
import { IcnBarChart } from '../icons/BadgeIcons';
import type { ChallengeType, PollKind } from '../../types/database';

type Props = {
  type: ChallengeType;
  /** When set, distinguishes "Would you rather" polls from generic polls in the UI. */
  title?: string | null;
  pollKind?: PollKind | null;
  size?: number;
  color: string;
};

function isWouldYouRather(title: string | undefined | null): boolean {
  if (!title) return false;
  return title.toLowerCase().includes('would you rather');
}

export function ChallengeTypeGlyph({ type, title, pollKind, size = 24, color }: Props) {
  const wyr = pollKind ? pollKind === 'wyr' : isWouldYouRather(title);
  if (type === 'poll' && wyr) {
    return (
      <View
        style={{
          width: size + 8,
          height: size + 8,
          borderRadius: (size + 8) / 2,
          borderWidth: 2,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: size * 0.45, fontWeight: '800', color }}>A/B</Text>
      </View>
    );
  }
  if (type === 'poll') return <IcnBarChart size={size} color={color} />;
  if (type === 'format') {
    return (
      <View
        style={{
          width: size + 8,
          height: size + 8,
          borderRadius: (size + 8) / 2,
          borderWidth: 2,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: size * 0.42, fontWeight: '800', color }}>Aa</Text>
      </View>
    );
  }
  if (type === 'task') return <IconCheck size={size} color={color} />;
  return <IconCamera size={size} color={color} />;
}
