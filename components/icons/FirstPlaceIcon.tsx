import Svg, { Circle, Path } from 'react-native-svg';

/** A first-place numeral stays legible inside the shared tier-colored badge. */
export function IcnFirstPlace({ size = 24, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="m8 15-2 7 6-3 6 3-2-7"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="9.5" r="7" fill={color} fillOpacity={0.12} />
      <Circle cx="12" cy="9.5" r="7" stroke={color} strokeWidth={1.8} />
      <Path
        d="M9 7.5 11.5 5.5H13V12h2v2H9v-2h2V8.2L10 9Z"
        fill={color}
      />
    </Svg>
  );
}
