import React from 'react';
import { IconCamera, IconCheck } from '../icons/Icons';
import { IcnBarChart } from '../icons/BadgeIcons';
import type { ChallengeType } from '../../types/database';

type Props = {
  type: ChallengeType;
  size?: number;
  color: string;
};

export function ChallengeTypeGlyph({ type, size = 24, color }: Props) {
  if (type === 'poll') return <IcnBarChart size={size} color={color} />;
  if (type === 'task') return <IconCheck size={size} color={color} />;
  return <IconCamera size={size} color={color} />;
}
