import {
  buildThemedColors,
  lightColors,
  darkColors,
  listShopAccentThemes,
  ACCENT_THEME_CATALOG,
  normalizeAppTheme,
  isAccentThemeKey,
  xpForLevel,
  xpToNextLevel,
  getCategoryColors,
} from '../../constants/theme';
import { sparksForBadgeTier, sparksForLevel, sparksForXp } from '../../constants/sparks';
import { Motion } from '../../constants/motion';

test.each(['light', 'dark'] as const)(
  '%s palette preserves surfaces and consistently applies its accent',
  (mode) => {
    const base = mode === 'light' ? lightColors : darkColors;
    const colors = buildThemedColors(mode, '#000000');
    expect(colors.background).toBe(base.background);
    expect(colors.primary).toBe('#000000');
    expect(colors.link).toBe('#000000');
    expect(colors.primaryHover).toBe('#000000');
    expect(colors.xpGradientStart).toBe('#000000');
    expect(colors.primaryLight).toBe(mode === 'light' ? '#ebebeb' : '#00000022');
    expect(colors.primaryPale).toBe(mode === 'light' ? '#d9d9d9' : '#00000018');
    expect(colors.accentGlow).toBe(mode === 'light' ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.22)');
    expect(getCategoryColors(colors)).toEqual({
      physical: colors.primary,
      creative: colors.accent,
      social: colors.link,
      mental: colors.success,
      wild: colors.warning,
    });
  },
);

test('shop catalogue excludes free default and every paid theme has a positive integer price', () => {
  const themes = listShopAccentThemes();
  expect(themes.map((x) => x.key)).toEqual(
    Object.keys(ACCENT_THEME_CATALOG).filter((key) => key !== 'doji_orange'),
  );
  for (const theme of themes) {
    expect(isAccentThemeKey(theme.key)).toBe(true);
    expect(Number.isInteger(theme.price)).toBe(true);
    expect(theme.price).toBeGreaterThan(0);
  }
  expect(isAccentThemeKey('synthetic-invalid')).toBe(false);
});

test.each([
  ['midnight', 'dark'],
  ['aurora', 'dark'],
  ['coral', 'light'],
  ['ocean', 'light'],
  ['forest', 'light'],
  ['blossom', 'light'],
  [undefined, 'dark'],
  [42, 'dark'],
])('legacy appearance %s normalizes to %s', (input, expected) => {
  expect(normalizeAppTheme(input)).toBe(expected);
});

test('XP thresholds clamp boundaries and max-level progress avoids division by zero', () => {
  expect(xpForLevel(0)).toBe(0);
  expect(xpForLevel(1)).toBe(0);
  expect(xpForLevel(2)).toBe(500);
  expect(xpForLevel(11)).toBe(16000);
  expect(xpToNextLevel(750, 2)).toEqual({ current: 250, max: 700 });
  expect(xpToNextLevel(17000, 10)).toEqual({ current: 1000, max: 1 });
});

test.each([
  ['bronze', 8],
  ['silver', 15],
  ['gold', 30],
  ['diamond', 60],
  ['unsupported', 0],
])('badge tier %s displays %s Sparks', (tier, amount) => {
  expect(sparksForBadgeTier(String(tier))).toBe(amount);
});

test('reward display minima and motion timing contract remain bounded', () => {
  expect(sparksForXp(0)).toBe(1);
  expect(sparksForXp(29)).toBe(5);
  expect(sparksForLevel(0)).toBe(5);
  expect(Motion.duration.instant).toBe(0);
  expect(Motion.duration.fast).toBeLessThan(Motion.duration.content);
  expect(Motion.duration.content).toBeLessThan(Motion.duration.sheet);
  expect(Motion.pressedScale).toBeGreaterThan(0);
  expect(Motion.pressedScale).toBeLessThan(1);
});

test('web-only root layout constraints never leak into native layouts', () => {
  for (const os of ['web', 'ios', 'android']) {
    jest.isolateModules(() => {
      const { Platform } = require('react-native');
      const previous = Platform.OS;
      try {
        Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
        const theme = require('../../constants/theme');
        expect(theme.webRootViewStyle).toEqual(
          os === 'web' ? { flex: 1, minHeight: '100vh' } : undefined,
        );
        expect(theme.webScrollParentStyle).toEqual(
          os === 'web' ? { flex: 1, minHeight: 0 } : undefined,
        );
      } finally {
        Object.defineProperty(Platform, 'OS', { configurable: true, value: previous });
      }
    });
  }
});
