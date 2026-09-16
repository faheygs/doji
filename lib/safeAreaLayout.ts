import type { PlatformOSType } from 'react-native';

const TAB_BAR_CONTENT_HEIGHT = 52;
const TAB_BAR_TOP_PADDING = 8;

export const TAB_SCREEN_SAFE_AREA_EDGES = ['top', 'left', 'right'] as const;

export function getBottomTabBarMetrics(
  platform: PlatformOSType,
  bottomInset: number,
): { height: number; paddingBottom: number; paddingTop: number } {
  const safeBottom = platform === 'web' ? 0 : Math.max(0, bottomInset);

  return {
    height: TAB_BAR_CONTENT_HEIGHT + safeBottom,
    paddingBottom: safeBottom,
    paddingTop: TAB_BAR_TOP_PADDING,
  };
}
