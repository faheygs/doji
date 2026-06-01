import React, { useId } from 'react';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { Brand } from '@/constants/theme';

type Props = {
  size?: number;
};

/** Four-point spark mark for Sparks currency. */
export function IconSpark({ size = 16 }: Props) {
  const gradId = useId().replace(/:/g, '');

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={gradId} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={Brand.orange} />
          <Stop offset="1" stopColor={Brand.violet} />
        </LinearGradient>
      </Defs>
      <Path
        d="M12 2.5 13.8 10.2 21.5 12 13.8 13.8 12 21.5 10.2 13.8 2.5 12 10.2 10.2Z"
        fill={`url(#${gradId})`}
      />
    </Svg>
  );
}
